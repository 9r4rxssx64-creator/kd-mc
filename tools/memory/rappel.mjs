/* RAPPEL AUTOMATIQUE À CHAQUE MESSAGE DE KEVIN (Kevin 7.10.2026 : « Tu as un gros problème de mémoire ! Pourquoi et comment
 * c'est possible avec tout ce que l'on a fait pour parer à ça ?! »).
 * MESURÉ : les règles complètes (CLAUDE-HISTOIRE.md), le métier (NOTES_USER.md) et les 440+ leçons (LESSONS.md) sont lus « à la
 * demande » — et la demande n'était pas faite avant d'agir (ex. le 6.10 : algorithme des départs changé sans relire les leçons
 * #138/#141 qui racontaient déjà ce va-et-vient). La mémoire compacte n'était injectée qu'au DÉMARRAGE d'une session.
 * Ici : le crochet UserPromptSubmit (.claude/hooks/rappel-message.sh) passe le message de Kevin à ce script, qui renvoie — avant
 * que Claude réponde — les décisions métier, les leçons et les faits durables qui parlent des MÊMES mots. Local, 0 réseau, ~0,1 s.
 * node tools/memory/rappel.mjs "texte du message"   (ou le message sur l'entrée standard) */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VIDES = new Set(('avec dans pour plus tout tous toutes elle elles ils nous vous mais donc alors aussi comme cette celle ceux '
  + 'faire fais fait être avoir sont était chaque même encore toujours jamais ensuite après avant entre leur leurs quand moins '
  + 'quoi quel quelle quels quelles très trop bien merci note rappel ainsi suite etc').split(' '));
const normal = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
/* racine grossière : « départs » / « depart » / « départ » → « depart » ; « inscriptions » → « inscription » */
const racine = (m) => m.replace(/(ements|ement|ations|ation|ements|s|x)$/, '').slice(0, 9);
export function mots(texte) {
  return [...new Set(normal(texte).split(/[^a-z0-9]+/).filter((m) => m.length >= 4 && !VIDES.has(m)).map(racine))].slice(0, 40);
}
function score(ligne, ms) {
  const l = normal(ligne); let n = 0;
  for (const m of ms) if (l.includes(m)) n++;
  return n;
}
function meilleures(lignes, ms, k, min) {
  return lignes.map((t) => ({ t, s: score(t, ms) })).filter((x) => x.s >= min).sort((a, b) => b.s - a.s).slice(0, k).map((x) => x.t);
}
const lire = (f) => (existsSync(join(RACINE, f)) ? readFileSync(join(RACINE, f), 'utf8') : '');
export function rappel(texte, { k = 5 } = {}) {
  const ms = mots(texte);
  if (ms.length < 1) return '';
  const min = ms.length >= 4 ? 2 : 1;
  const metier = meilleures(lire('NOTES_USER.md').split('\n').filter((l) => /^- \*\*/.test(l)), ms, k, min).map((l) => l.slice(0, 420));
  const lecons = meilleures(lire('LESSONS.md').split('\n').filter((l) => /^\d{1,4}\. \*\*/.test(l)), ms, k, min).map((l) => l.slice(0, 300));
  const regles = meilleures(lire('CLAUDE.md').split('\n').filter((l) => /^### /.test(l)), ms, 3, min).map((l) => l.slice(0, 200));
  let faits = '';
  try { faits = execFileSync(process.execPath, [join(RACINE, 'tools/memory/mem.cjs'), 'search', ms.join(' '), '--k', '4'], { encoding: 'utf8', timeout: 3000 }).trim().split('\n').map((l) => l.slice(0, 360)).join('\n'); } catch { faits = ''; }
  const blocs = [];
  if (metier.length) blocs.push('DÉCISIONS MÉTIER DE KEVIN (NOTES_USER.md) :\n' + metier.join('\n'));
  if (regles.length) blocs.push('RÈGLES (CLAUDE.md → récit dans CLAUDE-HISTOIRE.md) :\n' + regles.join('\n'));
  if (lecons.length) blocs.push('LEÇONS À NE PAS REFAIRE (LESSONS.md) :\n' + lecons.join('\n'));
  if (faits) blocs.push('FAITS DURABLES (mémoire compacte) :\n' + faits);
  if (!blocs.length) return '';
  return 'RAPPEL AUTOMATIQUE — ce que le projet sait déjà sur les mots de ce message (à relire AVANT d\'agir ; ouvrir le récit complet si une règle touche le sujet) :\n\n' + blocs.join('\n\n');
}
if (import.meta.url === `file://${process.argv[1]}`) {
  let t = process.argv.slice(2).join(' ');
  if (!t) { try { t = readFileSync(0, 'utf8'); } catch { t = ''; } }
  process.stdout.write(rappel(t));
}
