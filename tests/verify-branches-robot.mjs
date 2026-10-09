#!/usr/bin/env node
/**
 * Garde : aucune branche robot « silencieuse ».
 *
 * Mesuré le 10.09.2026 (leçon #243) : 10 workflows poussaient une branche
 * `claude/<nom>-${{ github.run_id }}` en écrivant « (auto-merge) » dans leur journal.
 * Or un push signé par GITHUB_TOKEN ne déclenche JAMAIS un autre workflow, et le
 * message portait `[skip ci]` : la fusion automatique ne les a jamais vues.
 * Résultat : 73 branches orphelines depuis juin, et la boutique La Détente qui
 * demande `push-config.json` — un fichier que main n'a jamais reçu.
 *
 * La règle, simple et vérifiable : un workflow qui crée une branche `claude/*-<run_id>`
 * doit DIRE ce qu'elle devient, par l'un des deux moyens seulement :
 *   (a) il publie via `./.github/actions/publier-config` → PR + fusion par le robot ;
 *   (b) il porte le marqueur `# branche-de-relecture` → la branche est faite pour être
 *       LUE (captures d'écran, images générées, moisson à relire), pas fusionnée.
 * Tout le reste = une branche qui ne va nulle part, et le garde échoue.
 *
 * Lancer : node tests/verify-branches-robot.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { workflowAuCoffre } from '../tools/depot-public/au-coffre.mjs';

const WF = '.github/workflows';
const ACTION = '.github/actions/publier-config/action.yml';
const R = { ok: [], ko: [] };
const chk = (cond, msg) => (cond ? R.ok : R.ko).push(msg);

const BRANCHE_ROBOT = /claude\/[a-z0-9-]+-\$\{\{\s*github\.run_id\s*\}\}/;
const codeSeul = (s) => s.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

/* ── 1. L'action existe et fait ce qu'elle promet ─────────────────────── */
chk(existsSync(ACTION), `l'action ${ACTION} existe`);
if (existsSync(ACTION)) {
  const a = readFileSync(ACTION, 'utf8');
  chk(/gh pr create/.test(a), 'l\'action crée une PR (pas une branche orpheline)');
  chk(/gh pr merge/.test(a), 'l\'action fusionne la PR elle-même (le push GITHUB_TOKEN ne réveille personne)');
  chk(/GITHUB_REF_NAME[^\n]*!= "main"/.test(a), 'l\'action refuse de publier depuis une branche claude/* (main seule base)');
  chk(/updated_at/.test(a), 'l\'action ignore les lignes d\'horodatage (sinon une branche par déploiement pour rien)');
  chk(/gh workflow run deploy\.yml/.test(a), 'l\'action relance deploy.yml après fusion (sinon le fichier n\'est pas servi)');
  chk(/exit 1/.test(a) && /Cause exacte/.test(a), 'une fusion refusée est ROUGE avec la cause exacte (leçon #214)');
}

/* ── 2. Chaque workflow qui crée une branche robot dit ce qu'elle devient ── */
const fichiers = readdirSync(WF).filter((f) => /\.ya?ml$/.test(f)).sort();
let relus = 0, publies = 0;
for (const f of fichiers) {
  const s = readFileSync(join(WF, f), 'utf8');
  const code = codeSeul(s);
  /* Deux façons de créer une branche robot : à la main dans le script (regex), ou via l'action
     (qui la crée pour le workflow — la regex ne la voit donc PAS dans le workflow lui-même). */
  const publie = /uses:\s*\.\/\.github\/actions\/publier-config/.test(code);
  const creeALaMain = BRANCHE_ROBOT.test(code);
  if (!publie && !creeALaMain) continue;
  const relecture = /^\s*#\s*branche-de-relecture/m.test(s);
  if (publie) {
    publies += 1;
    chk(true, `${f} : config PUBLIÉE dans main via l'action (PR + fusion)`);
    chk(/pull-requests:\s*write/.test(code), `${f} : a la permission pull-requests: write (sinon gh pr create échoue)`);
    chk(/actions:\s*write/.test(code), `${f} : a la permission actions: write (sinon deploy.yml ne se relance pas)`);
    chk(!creeALaMain, `${f} : ne crée plus de branche claude/*-<run_id> à la main en plus de l'action`);
    chk(!/git push -u origin "\$BR"/.test(code), `${f} : ne pousse plus de branche à la main en plus de l'action`);
  } else if (relecture) {
    relus += 1;
    chk(true, `${f} : branche robot déclarée « de relecture » (faite pour être lue, pas fusionnée)`);
  } else {
    chk(false, `${f} : crée une branche claude/*-<run_id> qui ne va NULLE PART — utiliser ./.github/actions/publier-config ou déclarer « # branche-de-relecture »`);
  }
}
chk(publies > 0 && relus > 0, `${publies} workflow(s) publient via l'action, ${relus} déposent une branche de relecture (le garde a quelque chose à garder)`);

/* ── Une branche ORPHELINE ne doit pas faire échouer Vercel (Kevin 18.09.2026) ──
 *
 * Vercel déploie TOUTE branche poussée. Le projet `kdmc-agent-monaco` a pour
 * dossier racine `tools/agent` ; une branche orpheline ne le contient pas, donc
 * le build meurt sur « The specified Root Directory "tools/agent" does not
 * exist » (lu dans le vrai journal de build) et un mail d'échec part chez Kevin.
 * Règle anti-spam : un robot ne remplit pas sa boîte.
 *
 * La parade existait depuis des semaines dans apex-chat-d1-backup.yml, recopiée
 * en clair… et voir-comme-kevin.yml ne l'avait jamais reçue. C'est exactement le
 * genre d'oubli qu'un garde doit rendre impossible : toute branche orpheline
 * passe désormais par le MÊME script, et on le vérifie ici.
 */
const MUSELIERE = 'tools/vercel/museler-branche-orpheline.sh';
chk(existsSync(MUSELIERE), `${MUSELIERE} existe (la parade Vercel est partagée, pas recopiée)`);
if (existsSync(MUSELIERE)) {
  /* On lit le CODE SEUL. La 1re version de ce contrôle cherchait le mot dans tout
     le fichier : l'en-tête explicatif le contenait, donc mettre `true` dans le
     code passait au VERT. Une règle citée dans un commentaire ne protège rien —
     le sabotage l'a montré avant qu'on y croie. */
  const m = codeSeul(readFileSync(MUSELIERE, 'utf8'));
  chk(/deploymentEnabled"?\s*:\s*false/.test(m), `${MUSELIERE} coupe bien les déploiements (deploymentEnabled: false, dans le CODE)`);
  chk(/tools\/agent\/vercel\.json/.test(m), `${MUSELIERE} écrit dans le dossier racine du projet Vercel (sinon Vercel ne lit rien)`);
  /* Le schéma Vercel REFUSE les clés inconnues, et un vercel.json refusé est un
     vercel.json IGNORÉ — donc aucune protection (vécu le 6.09). */
  const json = (m.match(/'(\{.*"git".*\})'/) || [, ''])[1];
  let cles = [];
  try { cles = Object.keys(JSON.parse(json)); } catch { cles = ['(illisible : ' + json.slice(0, 40) + ')']; }
  chk(cles.length > 0 && cles.every((k) => ['git', 'ignoreCommand', '$schema', 'version'].includes(k)),
    `${MUSELIERE} n'écrit que des clés connues de Vercel (${cles.join(', ')}) — une clé inconnue fait rejeter TOUT le fichier`);
}
let orphelins = 0;
for (const f of readdirSync(WF).filter((x) => x.endsWith('.yml'))) {
  const s = readFileSync(join(WF, f), 'utf8');
  if (!/git checkout --orphan/.test(codeSeul(s))) continue;
  orphelins += 1;
  chk(new RegExp(MUSELIERE.replace(/[/.]/g, '\\$&')).test(s),
    `${f} : crée une branche orpheline ET appelle ${MUSELIERE} (sinon Vercel échoue → mail à Kevin)`);
  chk(!/printf[^\n]*deploymentEnabled/.test(s),
    `${f} : n'écrit plus la parade Vercel à la main (une copie qui diverge ne protège qu'elle-même)`);
}
/* Dans le dépôt PUBLIC, les deux robots à branche orpheline (voir-comme-kevin, sauvegarde
   d'Apex Chat) vivent au coffre : le garde n'a alors rien à garder ICI, c'est normal. */
const orphelinsAuCoffre = ['voir-comme-kevin.yml', 'apex-chat-d1-backup.yml'].filter(workflowAuCoffre).length;
chk(orphelins > 0 || orphelinsAuCoffre > 0,
  orphelins > 0 ? `${orphelins} workflow(s) à branche orpheline contrôlés (le garde a quelque chose à garder)`
    : `0 ici, ${orphelinsAuCoffre} au coffre (contrôlés là-bas)`);

/* Deuxième ceinture : la config du projet Vercel refuse aussi les branches de
   captures par motif. On ne sait pas si Vercel lit cette clé depuis la branche de
   production ou depuis la branche poussée (dans ce 2e cas elle est inopérante sur
   une orpheline) — elle ne remplace donc PAS le script, elle le double. */
const CFG = 'tools/agent/vercel.json';
if (existsSync(CFG)) {
  let g = {};
  try { g = (JSON.parse(readFileSync(CFG, 'utf8')).git || {}).deploymentEnabled || {}; } catch { g = {}; }
  chk(g['claude/voir-*'] === false, `${CFG} refuse aussi les branches de captures par motif (claude/voir-*)`);
}

R.ok.forEach((m) => console.log('  OK ' + m));
R.ko.forEach((m) => console.log('  FAIL ' + m));
console.log(`=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
process.exit(R.ko.length ? 1 : 0);
