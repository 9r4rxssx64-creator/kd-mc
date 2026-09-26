/* L'INTERRUPTEUR DU RUNNER TIENT-IL ? — garde mécanique (24.09.2026)
 *
 * Kevin : « trouve des solutions en gratuit pour garder tout comme avant » puis
 * « un Lenovo de 5 ans max ». Depuis que le dépôt est privé, GitHub compte les
 * minutes de SES machines (2 000/mois, brûlées en 2 jours — mesuré). Une machine
 * à nous est illimitée et gratuite. Chaque workflow Linux porte donc :
 *
 *     runs-on: ${{ vars.KDMC_RUNNER || 'ubuntu-latest' }}
 *
 * Sans la variable → exactement comme avant. Avec → le Lenovo. Cette garde
 * empêche qu'un workflow ajouté demain « oublie » l'interrupteur et reparte en
 * silence brûler des minutes payantes — une règle qui ne vit que dans un
 * document finit sautée (leçon #142).
 *
 * Exceptions ASSUMÉES et listées ici, pas devinées :
 *   · macOS (×10, TestFlight) : un Linux ne peut pas les faire tourner ;
 *   · semgrep.yml : a besoin de Docker, absent d'un WSL de base.
 *
 * Prouvée discriminante : remettre « runs-on: ubuntu-latest » en dur dans un
 * workflow non listé → 1 échec.
 */
import { readdirSync, readFileSync } from 'node:fs';

const DOSSIER = '.github/workflows';
const EXPR = "runs-on: ${{ vars.KDMC_RUNNER || 'ubuntu-latest' }}";
const EXCEPTIONS_DOCKER = new Set(['semgrep.yml']);

let ok = 0, ko = 0;
const dis = (b, m) => { b ? ok++ : ko++; console.log(`  ${b ? '✅' : '❌'} ${m}`); };

const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith('.yml'));
console.log(`\nInterrupteur du runner — ${fichiers.length} workflows\n`);

let bascules = 0, macos = 0;
for (const f of fichiers) {
  const s = readFileSync(`${DOSSIER}/${f}`, 'utf8');
  const enDur = (s.match(/^\s*runs-on:\s*ubuntu-[a-z0-9.-]+\s*$/gm) || []).length;
  const avecExpr = s.includes(EXPR);
  if (/runs-on:.*macos/.test(s)) { macos++; continue; }
  if (EXCEPTIONS_DOCKER.has(f)) {
    dis(enDur > 0 && !avecExpr, `${f} reste sur la machine GitHub (Docker) — exception assumée`);
    continue;
  }
  if (enDur > 0) dis(false, `${f} porte encore « runs-on: ubuntu-… » en dur → il brûlerait des minutes payantes en silence`);
  if (avecExpr) bascules++;
}
dis(bascules >= 150, `${bascules} workflows portent l'interrupteur (attendu ≥ 150)`);
dis(macos === 3, `${macos} workflows macOS laissés tels quels (attendu 3 : TestFlight, ×10, à la main)`);

/* Le script d'installation du Lenovo doit enrôler la MÊME étiquette que celle
   attendue par l'interrupteur, sinon les tâches attendent une machine qui
   n'existe pas. */
const ps1 = readFileSync('tools/runner/installer-lenovo.ps1', 'utf8');
dis(/\$Etiquette\s*=\s*'kdmc-lenovo'/.test(ps1), "installer-lenovo.ps1 enrôle l'étiquette « kdmc-lenovo »");
dis(/KDMC_RUNNER/.test(ps1), 'installer-lenovo.ps1 explique la variable KDMC_RUNNER à poser');
dis(!/ghp_|github_pat_|A[A-Z0-9]{28}/.test(ps1), "installer-lenovo.ps1 ne contient aucun jeton en dur");
dis(/NOPASSWD/.test(ps1), 'le runner a sudo sans mot de passe (5 workflows installent des paquets)');
dis(/svc\.sh install/.test(ps1), 'le runner est installé comme service (redémarre tout seul)');
dis(/-Verb RunAs/.test(ps1) && /\$PSCommandPath/.test(ps1), "le .ps1 se relance lui-même en administrateur (Kevin n'a plus rien à taper)");
dis(/DisableAutomaticRestartSignOn.*-Value 0/.test(ps1) && /AutomaticRestartSignOnConfig.*-Value 1/.test(ps1),
  'ARSO : après une mise à jour Windows, la session se rouvre seule → le runner repart');
dis(ps1.charCodeAt(0) === 0xFEFF, 'installer-lenovo.ps1 commence par un BOM UTF-8 (sinon PowerShell 5.1 casse les accents)');

/* Le lanceur DOUBLE-CLIC (INSTALLER-LENOVO.cmd) est GÉNÉRÉ depuis le .ps1 par
   tools/runner/construire-cmd.mjs. S'ils divergent, Kevin lancerait une vieille
   version sans le savoir. Réparer = relancer le générateur, jamais éditer le .cmd. */
const { construire, CIBLE, MARQUEUR } = await import('../tools/runner/construire-cmd.mjs');
let cmd = '';
try { cmd = readFileSync(CIBLE, 'utf8'); } catch {}
dis(cmd.length > 0, `${CIBLE} existe`);
dis(cmd === construire(ps1), `${CIBLE} est exactement ce que génère construire-cmd.mjs depuis le .ps1 (sinon : node tools/runner/construire-cmd.mjs)`);
dis(cmd.startsWith('@echo off\r\n'), 'le .cmd commence par « @echo off » sans BOM (un BOM ferait échouer cmd.exe)');
dis(!/[^\r]\n/.test(cmd) && !/^\n/.test(cmd), 'le .cmd est entièrement en CRLF (cmd.exe est fragile avec LF seul)');
const lignes = cmd.split('\r\n');
dis(lignes.filter((l) => l === MARQUEUR).length === 1, `une seule ligne est exactement « ${MARQUEUR} » (c'est elle que l'extraction cherche, ligne entière)`);
dis(lignes.indexOf(MARQUEUR) > 0 && lignes[lignes.indexOf(MARQUEUR) - 1] === 'exit /b', 'cmd.exe s\'arrête (« exit /b ») juste avant la partie PowerShell');
dis(!/[^\x00-\x7F]/.test(lignes.slice(0, lignes.indexOf(MARQUEUR)).join('')), "l'en-tête cmd est en ASCII pur (cmd.exe lit en ANSI, pas en UTF-8)");
/* Simulation de l'extraction faite par l'en-tête (ReadAllLines + IndexOf ligne entière) :
   ce qui sort doit être le .ps1, au BOM près. */
const extrait = lignes.slice(lignes.indexOf(MARQUEUR) + 1).join('\n');
dis(extrait === ps1.replace(/^﻿/, '').replace(/\r\n/g, '\n'), "ce que l'en-tête extrait est exactement le .ps1 (simulation ReadAllLines/IndexOf)");
const attrs = readFileSync('.gitattributes', 'utf8');
dis(/^tools\/runner\/\*\.cmd\s+-text/m.test(attrs), '.gitattributes protège le CRLF du .cmd (« -text » : git ne convertit jamais)');

/* La porte « Claude sur le Lenovo » (Remote Control) : même exigences cmd.exe. */
let porte = '';
try { porte = readFileSync('tools/runner/CLAUDE-SUR-LE-LENOVO.cmd', 'utf8'); } catch {}
dis(porte.startsWith('@echo off\r\n') && !/[^\r]\n/.test(porte) && !/[^\x00-\x7F]/.test(porte),
  'CLAUDE-SUR-LE-LENOVO.cmd : ASCII pur, CRLF, sans BOM (cmd.exe)');
dis(/claude\.ai\/install\.ps1/.test(porte) && /remote-control/.test(porte), 'CLAUDE-SUR-LE-LENOVO.cmd installe Claude Code (adresse officielle) et lance Remote Control');
dis(!/ghp_|github_pat_|sk-ant-/.test(porte), 'CLAUDE-SUR-LE-LENOVO.cmd ne contient aucune clé');

console.log(`\n${ok} OK / ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
