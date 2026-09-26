#!/usr/bin/env node
/**
 * npm run transfert — fabrique le PAQUET DE REPRISE.
 *
 * But : si Kevin change d'IA, il donne ce paquet à la nouvelle et elle sait TOUT,
 * sans rien perdre : les regles, les 150+ lecons, le metier, les 40 sessions,
 * les branches, les adresses, les workers, les NOMS de secrets (jamais les valeurs).
 *
 * Ne copie QUE des fichiers deja publics (le depot est public) + un inventaire mesure.
 * Aucune valeur de secret n'est lue ni ecrite : une garde le verifie a la fin.
 *
 * Usage :
 *   node tools/transfert/export.mjs            -> fabrique transfert/ + l'archive
 *   node tools/transfert/export.mjs --liste    -> dit seulement ce qui serait copie
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const RACINE = process.cwd();
const SORTIE = path.join(RACINE, 'transfert');
const LISTE_SEULE = process.argv.includes('--liste');

/* Ordre de lecture = ordre d'importance pour une IA qui reprend le travail. */
const DOCS = [
  ['LESSONS.md',            'Les 150+ erreurs a NE JAMAIS refaire. A lire AVANT d ecrire une ligne.'],
  ['CLAUDE.md',             'Toutes les regles absolues de Kevin (+ leur histoire).'],
  ['NOTES_USER.md',         'Le metier : employes, equipes SBM, codes, couleurs du PDF, tables.'],
  ['TRANSFERT-COMPLET.md',  'La carte de tout : projets, adresses, workers, secrets, bascule.'],
  ['MEMO_RESUME.md',        'Ou en est chaque session.'],
  ['ETAT-INFRA.md',         'Les 12 faits d infra datés (GitHub / GitLab / Cloudflare).'],
  ['KEVIN_ACTIONS_TODO.md', 'Ce qui attend une action de Kevin.'],
  ['KEVIN_INVENTORY.md',    'Tous les fichiers crees, avec liens cliquables.'],
  ['IMPORT_RECONNAISSANCE.md','Comment on lit les PDF de planning SBM.'],
  ['KDMC_ADRESSES.md',      'La liste officielle des adresses du domaine.'],
  ['ORGANISATION.md',       'Ou va quoi : GitHub / GitLab / Worker / nulle part.'],
  ['AUDIT_TEMPLATE_PRO.md', 'Le modele d audit complet (11 axes).'],
  ['SECURITY.md',           'Ou signaler une faille (obligatoire, depot public).'],
  ['CHANGELOG.md',          'L historique des versions.'],
  ['APEX_HANDOFF.md',       'Le dialogue Apex <-> Claude Code.'],
  ['PIPELINE_BRANCHES_SESSIONS.md','Comment les sessions se coordonnent.'],
  ['AGENTS.md',             'Les regles au format lu par les autres outils (Codex, OpenCode...).'],
  ['pipeline/sessions.json','LES 40 SESSIONS + les 91 messages entre branches. Vital.'],
];

function sh(cmd, defaut = '') {
  try { return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return defaut; }
}

/* ---- 1. mesures reelles (jamais estimees) ---- */
function mesurer() {
  const m = { date: new Date().toISOString().slice(0, 10) };
  m.branches_distantes = Number(sh("git ls-remote --heads origin | wc -l", '0'));
  m.branches_claude = Number(sh("git ls-remote --heads origin | grep -c 'refs/heads/claude/'", '0'));
  m.commits_visibles = Number(sh('git rev-list --count --all', '0'));
  m.historique_superficiel = fs.existsSync(path.join(RACINE, '.git/shallow'));
  m.workers = sh("find services messaging-app shops tools -name wrangler.toml 2>/dev/null")
    .split('\n').filter(Boolean)
    .map(f => ({ nom: (fs.readFileSync(f, 'utf8').match(/^name\s*=\s*"([^"]+)"/m) || [, '?'])[1], fichier: f }))
    .sort((a, b) => a.nom.localeCompare(b.nom));
  const routeur = path.join(RACINE, 'services/kdmc-router/worker.js');
  m.adresses = fs.existsSync(routeur)
    ? [...new Set((fs.readFileSync(routeur, 'utf8').match(/'[a-z0-9-]+\.kd-mc\.com'/g) || []).map(s => s.replace(/'/g, '')))].sort()
    : [];
  const wf = path.join(RACINE, '.github/workflows');
  m.workflows_actifs = fs.existsSync(wf) ? fs.readdirSync(wf).filter(f => f.endsWith('.yml')).length : 0;
  m.secrets_noms = [...new Set(
    (fs.existsSync(wf) ? fs.readdirSync(wf).filter(f => f.endsWith('.yml')) : [])
      .flatMap(f => (fs.readFileSync(path.join(wf, f), 'utf8').match(/secrets\.[A-Z0-9_]+/g) || []))
      .map(s => s.replace('secrets.', ''))
  )].sort();
  m.tests = fs.existsSync(path.join(RACINE, 'tests')) ? fs.readdirSync(path.join(RACINE, 'tests')).length : 0;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8'));
    m.commandes_npm = Object.keys(pkg.scripts || {}).length;
  } catch { m.commandes_npm = 0; }
  try {
    const s = JSON.parse(fs.readFileSync(path.join(RACINE, 'pipeline/sessions.json'), 'utf8'));
    m.sessions = Object.keys(s.sessions || {}).length;
    m.messages_inter_branches = Array.isArray(s.messages) ? s.messages.length : Object.keys(s.messages || {}).length;
  } catch { m.sessions = 0; m.messages_inter_branches = 0; }
  /* le contexte recharge a CHAQUE message : la cause n1 de la consommation */
  let octets = 0;
  for (const f of ['CLAUDE.md']) { try { octets += fs.statSync(path.join(RACINE, f)).size; } catch {} }
  const rules = path.join(RACINE, '.claude/rules');
  if (fs.existsSync(rules)) for (const f of fs.readdirSync(rules)) octets += fs.statSync(path.join(rules, f)).size;
  m.contexte_auto_octets = octets;
  m.contexte_auto_tokens_estimes = Math.round(octets / 3.5);
  return m;
}

/* ---- 2. l INDEX que la nouvelle IA lit en premier ---- */
function ecrireIndex(m, copies) {
  const l = [];
  l.push('# 🧭 INDEX — a lire EN PREMIER (paquet de reprise KDMC)');
  l.push('');
  l.push(`> Fabrique le ${m.date} par \`npm run transfert\`. Depot : 9r4rxssx64-creator/CMCteams (public).`);
  l.push('> Tu reprends le travail de 40 sessions. Voici l ordre de lecture. Ne saute pas le 1.');
  l.push('');
  l.push('## Les 5 regles qui gouvernent tout (si tu ne lis que ca)');
  l.push('1. **Kevin n est pas codeur** : parler simple, decrire l ecran iPhone, jamais de jargon.');
  l.push('2. **Tout automatiser** : ne jamais lui demander un clic qu un script peut faire.');
  l.push('3. **Jamais estimer** : mesurer, et coller la sortie brute comme preuve.');
  l.push('4. **Jamais regresser** : chaque correctif porte son test de non-regression.');
  l.push('5. **Jamais dire "je ne peux pas"** : essayer page directe, recherche, connecteur,');
  l.push('   puis la CI (elle a le reseau ouvert) avant de conclure.');
  l.push('');
  l.push('## Ordre de lecture');
  copies.forEach((c, i) => l.push(`${i + 1}. **${c.fichier}** — ${c.pourquoi}`));
  l.push('');
  l.push('## L etat mesure du chantier');
  l.push('');
  l.push('| Quoi | Combien |');
  l.push('|---|---|');
  l.push(`| Sessions de travail suivies | ${m.sessions} |`);
  l.push(`| Messages entre branches (avertissements) | ${m.messages_inter_branches} |`);
  l.push(`| Branches distantes | ${m.branches_distantes} (dont ${m.branches_claude} \`claude/*\`) |`);
  l.push(`| Serveurs Cloudflare | ${m.workers.length} |`);
  l.push(`| Adresses du domaine | ${m.adresses.length} |`);
  l.push(`| Automatisations GitHub actives | ${m.workflows_actifs} |`);
  l.push(`| Gardes / tests | ${m.tests} fichiers, ${m.commandes_npm} commandes npm |`);
  l.push(`| Noms de secrets (valeurs JAMAIS ici) | ${m.secrets_noms.length} |`);
  l.push(`| Commits visibles dans ce clone | ${m.commits_visibles}${m.historique_superficiel ? ' (clone superficiel : `git fetch --unshallow` pour tout)' : ''} |`);
  l.push('');
  l.push('## ⚠️ La chose a corriger en premier (mesuree)');
  l.push('');
  l.push(`Le contexte recharge a **chaque message** pese **${m.contexte_auto_octets.toLocaleString('fr-FR')} octets**`);
  l.push(`(~**${m.contexte_auto_tokens_estimes.toLocaleString('fr-FR')} tokens**). Un fichier de regles sain fait 2 000 a 10 000 tokens.`);
  l.push('Decouper les regles (qui restent chargees) de leur histoire (lue a la demande) fait');
  l.push('baisser ce chiffre d environ 93 % **sans perdre une seule regle**.');
  l.push('Voir la section 2 de `TRANSFERT-COMPLET.md`.');
  l.push('');
  l.push('## Verifier que rien n est perdu');
  l.push('```bash');
  l.push('npm run test:ci        # les gardes passent');
  l.push('npm run test:docs-frais');
  l.push('node tools/pipeline/pipeline.mjs etat');
  l.push('```');
  l.push('');
  l.push('> Les **valeurs** de secrets ne sont dans aucun fichier de ce paquet (une garde le verifie).');
  l.push('> Elles vivent dans GitHub > Settings > Secrets, et nulle part ailleurs.');
  l.push('');
  fs.writeFileSync(path.join(SORTIE, 'INDEX.md'), l.join('\n'));
}

/* ---- 3. garde : aucune valeur de secret dans le paquet ---- */
const MOTIFS_INTERDITS = [
  [/sk-ant-api\d{2}-[A-Za-z0-9_-]{20,}/, 'cle Anthropic'],
  [/\bsk-[A-Za-z0-9]{40,}\b/, 'cle OpenAI'],
  [/\bghp_[A-Za-z0-9]{36}\b/, 'jeton GitHub'],
  [/\bglpat-[A-Za-z0-9_-]{20,}\b/, 'jeton GitLab'],
  [/\bxkeysib-[a-f0-9]{40,}/, 'cle Brevo'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'cle privee'],
];
function verifier() {
  const trouves = [];
  const parcourir = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { parcourir(p); continue; }
      if (!/\.(md|json|txt)$/.test(e.name)) continue;
      const t = fs.readFileSync(p, 'utf8');
      for (const [re, quoi] of MOTIFS_INTERDITS) if (re.test(t)) trouves.push(`${p} : ${quoi}`);
    }
  };
  parcourir(SORTIE);
  return trouves;
}

/* ---- main ---- */
const presents = DOCS.filter(([f]) => fs.existsSync(path.join(RACINE, f)));
const absents = DOCS.filter(([f]) => !fs.existsSync(path.join(RACINE, f))).map(([f]) => f);

if (LISTE_SEULE) {
  console.log(`\n📦 Ce qui serait copie (${presents.length} fichiers) :\n`);
  presents.forEach(([f, p], i) => {
    const ko = Math.round(fs.statSync(path.join(RACINE, f)).size / 1024);
    console.log(`  ${String(i + 1).padStart(2)}. ${f.padEnd(32)} ${String(ko).padStart(5)} Ko  — ${p}`);
  });
  if (absents.length) console.log(`\n⚠️  Introuvables (ignores) : ${absents.join(', ')}`);
  console.log('');
  process.exit(0);
}

fs.rmSync(SORTIE, { recursive: true, force: true });
fs.mkdirSync(path.join(SORTIE, 'memoire-compacte'), { recursive: true });

const copies = [];
for (const [f, pourquoi] of presents) {
  const dest = path.join(SORTIE, path.basename(f));
  fs.copyFileSync(path.join(RACINE, f), dest);
  copies.push({ fichier: path.basename(f), pourquoi, ko: Math.round(fs.statSync(dest).size / 1024) });
}

/* la memoire compacte : beaucoup de faits, peu de tokens */
const mem = path.join(RACINE, 'tools/memory');
if (fs.existsSync(mem)) for (const f of fs.readdirSync(mem)) {
  const s = path.join(mem, f);
  if (fs.statSync(s).isFile()) fs.copyFileSync(s, path.join(SORTIE, 'memoire-compacte', f));
}

const m = mesurer();
fs.writeFileSync(path.join(SORTIE, 'INVENTAIRE.json'), JSON.stringify(m, null, 2));
fs.writeFileSync(path.join(SORTIE, 'BRANCHES.txt'),
  sh("git ls-remote --heads origin | sed 's#.*refs/heads/##' | sort", '(git indisponible)') + '\n');
ecrireIndex(m, copies);

const fuites = verifier();
if (fuites.length) {
  console.error('\n❌ ARRET : des valeurs de secrets se trouvaient dans le paquet :');
  fuites.forEach(f => console.error('   - ' + f));
  fs.rmSync(SORTIE, { recursive: true, force: true });
  process.exit(1);
}

const nomArchive = `transfert-kdmc-${m.date}.tgz`;
const archiveOk = sh(`tar -czf "${nomArchive}" transfert 2>&1 && echo ok`) === 'ok';
const tailleTotale = copies.reduce((s, c) => s + c.ko, 0);

console.log('\n✅ Paquet de reprise fabrique.\n');
console.log(`   Dossier  : transfert/  (${copies.length} documents, ${tailleTotale} Ko)`);
if (archiveOk) console.log(`   Archive  : ${nomArchive}  (${Math.round(fs.statSync(path.join(RACINE, nomArchive)).size / 1024)} Ko)`);
console.log(`   A lire   : transfert/INDEX.md  <- donne CE fichier en premier a la nouvelle IA`);
console.log(`\n   Mesure   : ${m.sessions} sessions · ${m.branches_distantes} branches · ${m.workers.length} workers · ${m.adresses.length} adresses`);
console.log(`              ${m.secrets_noms.length} noms de secrets (0 valeur) · ${m.tests} tests`);
console.log(`\n   ⚠️  Contexte recharge a chaque message : ${m.contexte_auto_tokens_estimes.toLocaleString('fr-FR')} tokens`);
console.log(`       (voir section 2 de TRANSFERT-COMPLET.md : -93 % possible sans rien perdre)`);
if (absents.length) console.log(`\n   ℹ️  Introuvables, ignores : ${absents.join(', ')}`);
console.log('');
