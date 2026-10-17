#!/usr/bin/env node
/* QUELS ROBOTS DU DÉPÔT PUBLIC AURAIENT DÛ PARTIR ? (17.10.2026, publication automatique depuis le coffre)
 *
 * Quand le robot public « publier depuis le coffre » pousse avec le jeton du job (GITHUB_TOKEN), GitHub ne déclenche AUCUN autre
 * workflow sur ce push (règle anti-boucle de GitHub). Les déploiements (routeur = les pages, un worker par dossier) ne partiraient
 * donc pas. Ce script refait le travail de GitHub : pour chaque fichier changé, il cherche les workflows dont `on.push` vise `main`
 * et dont les `paths` correspondent (mêmes règles : `**`, `*`, `?`, négation `!`, le dernier motif qui correspond l'emporte ;
 * sans `paths` ni `paths-ignore` → tout changement compte). Il écrit un nom de fichier de workflow par ligne ; le robot les lance
 * par `workflow_dispatch`.
 *
 *   node tools/depot-public/robots-a-relancer.mjs --fichiers <liste.txt> [--workflows .github/workflows]
 * Pur et testable : `robotsARelancer(fichiers, workflows)` (tests/verify-robots-a-relancer.mjs). */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

/** Un motif de chemin GitHub → expression régulière (ancrée). */
export function motifVersRegex(motif) {
  let m = String(motif || '').trim().replace(/^!/, '');
  let out = '^';
  for (let i = 0; i < m.length; i++) {
    const c = m[i];
    if (c === '*') {
      if (m[i + 1] === '*') { out += '.*'; i++; if (m[i + 1] === '/') i++; }
      else out += '[^/]*';
    } else if (c === '?') out += '[^/]';
    else if ('.+^$()[]{}|\\'.includes(c)) out += '\\' + c;
    else out += c;
  }
  return new RegExp(out + '$');
}

/** Le fichier déclenche-t-il ce jeu de motifs (`paths`) ? Dernier motif qui correspond l'emporte ; `!` retire. */
export function cheminCorrespond(fichier, motifs) {
  let res = false;
  for (const p of motifs || []) {
    const neg = String(p).startsWith('!');
    if (motifVersRegex(p).test(fichier)) res = !neg;
  }
  return res;
}

/** Ce que GitHub ferait pour un push sur main de ces fichiers, d'après le YAML d'un workflow. */
export function workflowDeclenche(yamlTexte, fichiers) {
  let doc;
  try { doc = yaml.load(yamlTexte); } catch { return false; }
  const on = doc && (doc.on ?? doc[true]); /* `on:` se lit `true` en YAML 1.1 */
  if (!on) return false;
  let push = null;
  if (Array.isArray(on)) push = on.includes('push') ? {} : null;
  else if (typeof on === 'string') push = on === 'push' ? {} : null;
  else if (typeof on === 'object' && 'push' in on) push = on.push || {};
  if (!push) return false;
  const branches = push.branches;
  if (Array.isArray(branches) && !branches.some((b) => cheminCorrespond('main', [b]))) return false;
  if (Array.isArray(push['branches-ignore']) && push['branches-ignore'].some((b) => cheminCorrespond('main', [b]))) return false;
  const paths = push.paths, ignore = push['paths-ignore'];
  return (fichiers || []).some((f) => {
    if (Array.isArray(paths) && paths.length) return cheminCorrespond(f, paths);
    if (Array.isArray(ignore) && ignore.length) return !cheminCorrespond(f, ignore);
    return true;
  });
}

/** Ce qui vaut la peine d'être relancé : les DÉPLOIEMENTS (`deploy-<quoi>.yml`), jamais `deploy.yml` (hébergeur hors porte, au coffre),
 *  ni les robots de test / lint / sécurité (ils tournent déjà au prochain push d'une session, et ne mettent rien en ligne). */
export const DEPLOIEMENTS = /^deploy-[\w.-]+\.ya?ml$/;
/** [{nom, yaml}] → noms des workflows à relancer, dans l'ordre alphabétique. `filtre` (regex) : par défaut les déploiements. */
export function robotsARelancer(fichiers, workflows, filtre = DEPLOIEMENTS) {
  return (workflows || []).filter((w) => (!filtre || filtre.test(w.nom)) && workflowDeclenche(w.yaml, fichiers)).map((w) => w.nom).sort();
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const args = process.argv.slice(2);
  const val = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
  const liste = val('--fichiers', ''), dossier = val('--workflows', '.github/workflows');
  if (!liste) { console.error('usage : --fichiers <liste.txt> [--workflows <dossier>]'); process.exit(2); }
  const fichiers = readFileSync(liste, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  const workflows = readdirSync(dossier).filter((f) => /\.ya?ml$/.test(f)).map((f) => ({ nom: f, yaml: readFileSync(join(dossier, f), 'utf8') }));
  const tout = args.includes('--tout');
  for (const n of robotsARelancer(fichiers, workflows, tout ? null : undefined)) console.log(n);
}
