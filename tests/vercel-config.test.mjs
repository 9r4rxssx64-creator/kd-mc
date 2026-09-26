#!/usr/bin/env node
/**
 * Garde : les DEUX `vercel.json` du dépôt respectent le SCHÉMA de Vercel.
 *
 * POURQUOI ELLE EXISTE
 * --------------------
 * Quand un `vercel.json` est refusé par le schéma, Vercel échoue **AVANT le build**
 * (journaux de build vides) → un mail « Preview deployment failed » à Kevin à CHAQUE
 * push, sur TOUTES les branches, et **aucune** des protections du fichier ne s'applique
 * (donc les prévisualisations qu'il était censé couper repartent de plus belle).
 *
 * Trois causes vécues, toutes invisibles à la simple lecture du fichier :
 *
 *   1. `"_note": "…"` ajouté pour expliquer le filtre (05/09/2026)
 *      → « schema validation failed: should NOT have additional property `_note` ».
 *        Vercel refuse TOUTE clé inconnue.
 *   2. `ignoreCommand` trop longue : 406 caractères dans `tools/agent/vercel.json`,
 *      **647** dans le `vercel.json` racine
 *      → « `ignoreCommand` should NOT be longer than 256 characters ».
 *   3. `git diff HEAD^ HEAD` sans vérifier que `HEAD^` existe
 *      → le clone que Vercel fabrique est SUPERFICIEL, git sort en 128, et Vercel
 *        compte ça comme une erreur de build.
 *
 * LA RAISON POUR LAQUELLE CE FICHIER EST SUR `main` ET PAS SEULEMENT SUR UNE BRANCHE :
 * le 05/09 le correctif a été écrit sur une branche et **n'a jamais fusionné** ; `main`
 * est resté cassé un jour entier pendant que chaque session poussait (20 déploiements en
 * 16 minutes le 06/09, dont les déploiements de PRODUCTION). Une garde qui ne vit pas sur
 * `main` ne garde rien.
 *
 * Leçon #218. Un commentaire se met dans le commit ou dans un .md voisin, jamais dans un
 * fichier de configuration à schéma strict.
 *
 * Câblé dans `npm run test:ci`.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Clés réellement acceptées par le schéma Vercel. Ajouter une clé ici = avoir vérifié
   qu'elle existe dans le schéma, pas l'inverse. */
const CLES_CONNUES = new Set([
  '$schema', 'version', 'git', 'ignoreCommand', 'crons', 'functions',
  'buildCommand', 'installCommand', 'outputDirectory', 'devCommand',
  'framework', 'headers', 'redirects', 'rewrites', 'regions', 'public',
  'cleanUrls', 'trailingSlash', 'images', 'rootDirectory',
]);
const MAX_IGNORE = 256;

/* Les deux fichiers, et ce qu'on attend du filtre de chacun.
   - racine       : projet du site (statique) — pas de notion de branche, il exclut des dossiers.
   - tools/agent  : projet kdmc-agent-monaco — cron de PRODUCTION, aucune prévisualisation. */
const FICHIERS = [
  { chemin: 'vercel.json', exigeBranche: false },
  { chemin: 'tools/agent/vercel.json', exigeBranche: true },
];

let ok = 0;
let fail = 0;
const OK = (m) => { ok++; console.log('  OK   ' + m); };
const FAIL = (m) => { fail++; console.log('  FAIL ' + m); };

console.log('\nConfiguration Vercel — schéma strict, les 2 fichiers (leçon #218)\n');

for (const { chemin, exigeBranche } of FICHIERS) {
  const abs = join(ROOT, chemin);
  console.log('· ' + chemin);

  if (!existsSync(abs)) {
    console.log('  (absent — rien à vérifier)');
    continue;
  }

  let conf;
  try {
    conf = JSON.parse(readFileSync(abs, 'utf8'));
    OK('JSON valide');
  } catch (e) {
    FAIL('illisible : ' + e.message);
    continue;
  }

  const inconnues = Object.keys(conf).filter((k) => !CLES_CONNUES.has(k));
  if (inconnues.length === 0) {
    OK('aucune clé inconnue (Vercel les refuse et échoue AVANT le build)');
  } else {
    FAIL(
      'clé(s) refusée(s) par Vercel : ' + inconnues.join(', ') +
      " — une explication va dans le commit ou dans un .md voisin, pas ici"
    );
  }

  if (typeof conf.ignoreCommand !== 'string') continue;

  const n = conf.ignoreCommand.length;
  if (n <= MAX_IGNORE) OK('ignoreCommand : ' + n + ' caractères (limite ' + MAX_IGNORE + ')');
  else FAIL('ignoreCommand : ' + n + ' > ' + MAX_IGNORE + " → schéma refusé, mail d'échec à chaque push");

  /* La logique peut être déléguée à un script (c'est ainsi qu'on tient les 256 caractères).
     Dans ce cas, c'est le SCRIPT qu'il faut contrôler, pas la ligne d'appel. */
  const delegue = conf.ignoreCommand.match(/(?:^|\s)((?:tools|scripts)\/[\w./-]+\.sh)/);
  let logique = conf.ignoreCommand;
  let sourceLogique = 'ignoreCommand';

  if (delegue) {
    const script = join(ROOT, delegue[1]);
    if (existsSync(script)) {
      OK('délègue à ' + delegue[1] + ' (présent)');
      logique = readFileSync(script, 'utf8');
      sourceLogique = delegue[1];
    } else {
      FAIL('délègue à ' + delegue[1] + " qui n'existe pas → le filtre plante à chaque push");
      continue;
    }
  }

  /* Cause n°3 : survivre à un clone sans historique. */
  if (/HEAD\^/.test(logique)) {
    if (/rev-parse[^\n]*HEAD\^/.test(logique)) {
      OK(sourceLogique + " vérifie que HEAD^ existe avant de comparer (clone Vercel superficiel)");
    } else {
      FAIL(
        sourceLogique + ' compare HEAD^ sans vérifier qu\'il existe — git sort en 128 sur le ' +
        'clone Vercel, compté comme une erreur de build'
      );
    }
  }

  /* Pour l'agent : ne jamais laisser revenir les prévisualisations par branche (40/jour le 05/09). */
  if (exigeBranche) {
    if (/VERCEL_GIT_COMMIT_REF/.test(logique)) {
      OK(sourceLogique + ' distingue main des branches (aucune prévisualisation par branche)');
    } else {
      FAIL(sourceLogique + ' ne regarde plus la branche — les prévisualisations reviennent');
    }
  }
}

console.log('\n=== ' + ok + ' OK / ' + fail + ' FAIL ===\n');
process.exit(fail ? 1 : 0);
