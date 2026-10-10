#!/usr/bin/env node
/**
 * npm run maj-tout — MET TOUT À JOUR, ET LE GARDE À JOUR (Kevin 2026-09-24 :
 * « Mets tout à jour temps réel · L'avenir aussi »).
 *
 * POURQUOI : la règle « DOCS TEMPS RÉEL TOUJOURS À JOUR » existe depuis le 16.05.2026 et
 * Kevin a quand même dû la redemander — parce qu'elle dépendait de ma mémoire. Un document
 * écrit à la main est périmé le lendemain : TRANSFERT-COMPLET.md annonçait « dépôt public »
 * et « 219 branches » deux jours après que le dépôt soit passé privé avec 239 branches.
 *
 * CE QU'IL FAIT
 *   1. régénère l'index CLAUDE.md depuis CLAUDE-HISTOIRE.md
 *   2. régénère les CHIFFRES VIVANTS dans les documents, entre marqueurs
 *      <!-- MAJ-AUTO:debut <clé> --> … <!-- MAJ-AUTO:fin <clé> -->
 *      (le texte écrit à la main autour n'est JAMAIS touché)
 *   3. régénère BILAN-BRANCHES.md (mode complet seulement : il a besoin du réseau)
 *   4. dit ce qui reste à faire à la main
 *
 * QUAND IL TOURNE (« l'avenir aussi »)
 *   · à CHAQUE fin de tour        → hook Stop de .claude/settings.json (--rapide, sans réseau)
 *   · à la demande                → npm run maj-tout            (complet, avec réseau)
 *   · vérifié par la chaîne       → npm run test:maj-tout       (échoue si un bloc est périmé)
 *
 * Usage :
 *   node tools/audit/maj-tout.mjs              complet (réseau : branches, visibilité, CI)
 *   node tools/audit/maj-tout.mjs --rapide     local seulement, < 2 s (pour le hook)
 *   node tools/audit/maj-tout.mjs --verifier   n'écrit rien ; code 1 si quelque chose est périmé
 *   node tools/audit/maj-tout.mjs --silencieux pas d'affichage (pour le hook)
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const A = process.argv.slice(2);
const RAPIDE = A.includes('--rapide') || A.includes('--verifier');
const VERIFIER = A.includes('--verifier');
const MUET = A.includes('--silencieux');
const log = (...x) => { if (!MUET) console.log(...x); };

const sh = (c, d = '') => {
  try { return execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 }).trim(); }
  catch { return d; }
};
const taille = (f) => { try { return fs.statSync(f).size; } catch { return 0; } };
const nb = (n) => Number(n).toLocaleString('fr-FR');
const compte = (cmd) => Number(sh(cmd, '0')) || 0;

/* ─────────── 1. les chiffres vivants (mesurés, jamais écrits à la main) ─────────── */
function mesurer() {
  const m = { date: new Date().toISOString().slice(0, 10), rapide: RAPIDE };

  /* local — toujours */
  m.claude_index = taille('CLAUDE.md');
  m.claude_recit = taille('CLAUDE-HISTOIRE.md');
  m.tokens_index = Math.round(m.claude_index / 3.5);
  m.workflows = compte('ls .github/workflows/*.yml 2>/dev/null | wc -l');
  m.workflows_ranges = compte('ls .github/workflows-desactives/ 2>/dev/null | wc -l');
  m.tests = compte('ls tests/ 2>/dev/null | wc -l');
  m.workers = compte("find services messaging-app shops tools -name wrangler.toml 2>/dev/null | wc -l");
  m.pages = compte("find . -maxdepth 3 -name index.html -not -path '*/node_modules/*' -not -path './vendor/*' -not -path '*/coverage/*' -not -path './dist/*' 2>/dev/null | wc -l");
  try { m.scripts_npm = Object.keys(JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts || {}).length; } catch { m.scripts_npm = 0; }
  const wf = '.github/workflows';
  const noms = new Set();
  if (fs.existsSync(wf)) for (const f of fs.readdirSync(wf).filter((x) => x.endsWith('.yml')))
    (fs.readFileSync(`${wf}/${f}`, 'utf8').match(/secrets\.[A-Z0-9_]+/g) || []).forEach((s) => noms.add(s));
  m.secrets = noms.size;
  const routeur = 'services/kdmc-router/worker.js';
  m.adresses = fs.existsSync(routeur)
    ? new Set((fs.readFileSync(routeur, 'utf8').match(/'[a-z0-9-]+\.kd-mc\.com'/g) || [])).size : 0;
  try {
    const r = JSON.parse(fs.readFileSync('pipeline/sessions.json', 'utf8'));
    m.sessions = Object.keys(r.sessions || {}).length;
    const msgs = Array.isArray(r.messages) ? r.messages : Object.values(r.messages || {});
    m.messages = msgs.length;
    m.messages_ouverts = msgs.filter((x) => x.etat !== 'clos').length;
    m.attentes = Object.entries(r.sessions || {})
      .filter(([, s]) => s.attend_kevin).map(([id, s]) => ({ id, quoi: s.attend_kevin }));
  } catch { m.sessions = 0; m.messages = 0; m.messages_ouverts = 0; m.attentes = []; }
  m.branches_locales = compte("git branch -r 2>/dev/null | grep -c 'origin/' ");

  /* réseau — mode complet seulement */
  if (!RAPIDE) {
    m.branches = compte('git ls-remote --heads origin 2>/dev/null | wc -l') || m.branches_locales;
    const depot = sh(`curl -sS -m 20 "https://api.github.com/repos/9r4rxssx64-creator/CMCteams"`);
    try { const d = JSON.parse(depot); m.depot_prive = !!d.private; m.depot_visibilite = d.visibility || '?'; } catch { m.depot_visibilite = 'non vérifié'; }
    const runs = sh(`curl -sS -m 25 "https://api.github.com/repos/9r4rxssx64-creator/CMCteams/actions/runs?per_page=30"`);
    try {
      const d = JSON.parse(runs).workflow_runs || [];
      const courts = d.filter((r) => {
        const t0 = new Date(r.run_started_at), t1 = new Date(r.updated_at);
        return (t1 - t0) / 1000 < 15 && r.conclusion === 'failure';
      }).length;
      m.ci_runs_examines = d.length;
      m.ci_echecs_immediats = courts;
      m.ci_en_panne = d.length >= 10 && courts / d.length > 0.6;
    } catch { m.ci_en_panne = null; }
  } else {
    m.branches = m.branches_locales;
  }
  return m;
}

/* ─────────── 2. les blocs régénérés ─────────── */
function blocs(m) {
  const b = {};

  /* ⚠ « Branches dans le dépôt » N'EST PLUS ICI (26.09.2026). Ce bloc est COMPARÉ par
     le garde, et le nombre de branches change tout seul (robots, autres sessions) :
     le document disait 249 pendant que la mesure disait 250 → `test:maj-tout` rouge,
     donc `test:ci` bloqué pour TOUT LE MONDE, sans qu'aucun code soit en cause.
     C'est le piège de la valeur volatile (leçon #94), que le commentaire ci-dessous
     décrivait déjà… tout en la laissant dans le bloc comparé. Elle reste affichée dans
     `etat-live`, qui n'est jamais comparé. */
  b['chiffres'] = [
    `| Ce qu'on a | Combien | Mesuré par |`,
    `|---|---|---|`,
    `| Chantiers suivis (sessions) | **${m.sessions}** | \`pipeline/sessions.json\` |`,
    `| Applications / pages | **${m.pages}** | \`find -maxdepth 3 -name index.html\` |`,
    `| Adresses du domaine kd-mc.com | **${m.adresses}** | \`services/kdmc-router/worker.js\` |`,
    `| Serveurs Cloudflare (workers) | **${m.workers}** | \`find -name wrangler.toml\` |`,
    `| Automatisations actives | **${m.workflows}** (+ ${m.workflows_ranges} rangées) | \`.github/workflows/\` |`,
    `| Gardes / tests | **${m.tests}** fichiers, **${m.scripts_npm}** commandes \`npm run\` | \`tests/\` + \`package.json\` |`,
    `| Noms de secrets (jamais les valeurs) | **${m.secrets}** | \`grep secrets.\` sur les workflows |`,
    `| Discussions entre sessions | **${m.messages}** dont **${m.messages_ouverts}** ouvertes | \`pipeline/sessions.json\` |`,
    `| \`CLAUDE.md\` rechargé à chaque message | **${nb(m.claude_index)} o ≈ ${nb(m.tokens_index)} tokens** | \`wc -c\` |`,
    `| \`CLAUDE-HISTOIRE.md\` (à la demande) | **${nb(m.claude_recit)} o** | \`wc -c\` |`,
  ].join('\n');

  /* Bloc VOLATIL (réseau) : il change à chaque appel, donc il n'est JAMAIS comparé par le
     garde — sinon faux rouge permanent (piège de la valeur volatile, leçon #94). */
  b['etat-live'] = RAPIDE
    ? null   // mode rapide : on ne touche pas à ce bloc, la dernière mesure reste affichée
    : [
        `| Ce qui bouge | État au ${m.date} | Mesuré par |`,
        `|---|---|---|`,
        `| Branches dans le dépôt | **${m.branches}** | \`git ls-remote\` |`,
        `| Visibilité du dépôt | **${m.depot_visibilite}** | API GitHub |`,
        m.ci_en_panne === true
          ? `| État de la CI | 🔴 **à l'arrêt** — ${m.ci_echecs_immediats}/${m.ci_runs_examines} runs échouent en moins de 15 s | API GitHub |`
          : m.ci_en_panne === false
            ? `| État de la CI | 🟢 **elle tourne** — ${m.ci_echecs_immediats}/${m.ci_runs_examines} échecs immédiats | API GitHub |`
            : `| État de la CI | non vérifié | — |`,
      ].join('\n');

  b['attentes-kevin'] = m.attentes.length
    ? m.attentes.map((a) => `- 👤 **${a.quoi}**  \`${a.id}\``).join('\n')
    : '- ✅ Rien n\'attend Kevin pour l\'instant.';

  return b;
}

/* ─────────── 3. écriture entre marqueurs ─────────── */
const CIBLES = [
  ['TRANSFERT-COMPLET.md', 'chiffres'],
  ['TRANSFERT-COMPLET.md', 'etat-live'],
  ['TRANSFERT-COMPLET.md', 'attentes-kevin'],
  ['KEVIN_ACTIONS_TODO.md', 'attentes-kevin'],
];

function appliquer(b) {
  const perimes = [], maj = [];
  for (const [fichier, cle] of CIBLES) {
    if (VERIFIER && cle === 'etat-live') continue;      // volatil : jamais comparé
    if (!fs.existsSync(fichier)) continue;
    const t = fs.readFileSync(fichier, 'utf8');
    const d = `<!-- MAJ-AUTO:debut ${cle} -->`, f = `<!-- MAJ-AUTO:fin ${cle} -->`;
    const i = t.indexOf(d), j = t.indexOf(f);
    if (i < 0 || j < 0) continue;                       // pas de marqueur : on ne touche à rien
    if (b[cle] == null) continue;                       // bloc volatil non mesuré (mode rapide)
    const avant = t.slice(i + d.length, j);
    const neuf = `\n${b[cle]}\n`;
    if (avant === neuf) continue;
    perimes.push(`${fichier} § ${cle}`);
    if (!VERIFIER) { fs.writeFileSync(fichier, t.slice(0, i + d.length) + neuf + t.slice(j)); maj.push(`${fichier} § ${cle}`); }
  }
  return { perimes, maj };
}

/* ─────────── main ─────────── */
const m = mesurer();
const b = blocs(m);

/* l'index des règles */
let indexAjour = true;
try { execSync('node tools/audit/claude-md-index.mjs --verifier', { stdio: 'pipe' }); }
catch { indexAjour = false; }
if (!indexAjour && !VERIFIER) {
  execSync('node tools/audit/claude-md-index.mjs', { stdio: MUET ? 'pipe' : 'inherit' });
  m.claude_index = taille('CLAUDE.md');
}

const { perimes, maj } = appliquer(b);

/* le bilan des branches : réseau, donc mode complet */
if (!RAPIDE && !VERIFIER) {
  try { execSync('node tools/pipeline/bilan.mjs --court', { stdio: 'pipe' }); } catch {}
}

if (VERIFIER) {
  const pb = [...perimes]; if (!indexAjour) pb.unshift('CLAUDE.md (index des règles)');
  if (!pb.length) { log('✅ tout est à jour.'); process.exit(0); }
  console.error('❌ périmé : ' + pb.join(' · ') + '\n   → npm run maj-tout');
  process.exit(1);
}

log(`\n🔄 Mise à jour ${RAPIDE ? 'rapide (sans réseau)' : 'complète'} — ${m.date}`);
log(`   ${m.sessions} chantiers · ${m.branches} branches · ${m.pages} pages · ${m.adresses} adresses · ${m.workers} workers`);
log(`   ${m.workflows} automatisations · ${m.tests} tests · ${m.scripts_npm} commandes · ${m.secrets} noms de secrets`);
log(`   CLAUDE.md : ${nb(m.claude_index)} o ≈ ${nb(m.tokens_index)} tokens à chaque message`);
if (m.depot_visibilite) log(`   dépôt : ${m.depot_visibilite}${m.ci_en_panne === true ? ' · 🔴 CI à l\'arrêt' : m.ci_en_panne === false ? ' · 🟢 CI OK' : ''}`);
log(maj.length ? `   ✍️  remis à jour : ${maj.join(' · ')}` : '   ✅ documents déjà à jour');
if (m.attentes.length) { log(`   👤 ${m.attentes.length} chose(s) attendent Kevin :`); m.attentes.forEach((a) => log(`      · ${a.quoi}`)); }
log('');
