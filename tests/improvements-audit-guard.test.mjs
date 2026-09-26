/* GARDE-FOU — la PASSE AMÉLIORATIONS TOTALES ne doit jamais redevenir « juste une consigne
 * écrite dans un dossier » (Kevin 2026-08-09 : « intègre dans fais ton audit une audit de full
 * améliorations »).
 *
 * POURQUOI CE GARDE EXISTE : le 2026-08-09, Kevin a dû me rappeler la parité Apex alors qu'elle
 * était écrite noir sur blanc dans CLAUDE.md. Cause racine : la règle vivait dans les documents,
 * mais RIEN ne la faisait respecter automatiquement. Correctif : chaque nouvelle règle d'audit
 * arrive avec sa garde CI. Celle-ci vérifie que l'outil existe, TOURNE vraiment, que le ratchet
 * tient, que la règle est déclarée, et qu'Apex a la même passe (parité).
 *
 * node tests/improvements-audit-guard.test.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

let pass = 0;
const fails = [];
const ok = (c, m) => (c ? pass++ : fails.push(m));

/* 1. L'outil existe et TOURNE (pas seulement présent sur le disque). */
const TOOL = 'tools/audit/improvements-audit.cjs';
ok(existsSync(join(ROOT, TOOL)), TOOL + ' existe');
let out = '';
let ran = false;
try {
  out = execFileSync(process.execPath, [TOOL], { cwd: ROOT, timeout: 120_000 }).toString();
  ran = true;
} catch (e) {
  /* exit 1 = ratchet cassé : on récupère quand même la sortie pour le diagnostic (règle
     « toujours détailler les erreurs, cause exacte ») */
  out = (e && e.stdout && e.stdout.toString()) || '';
  fails.push('l\'audit améliorations sort en échec (un compteur est EN HAUSSE = la dette augmente). '
    + 'Sortie : ' + (out.split('\n').filter((l) => l.includes('EN HAUSSE')).join(' | ') || '(vide)'));
}
ok(ran || out.length > 0, 'l\'outil a produit une sortie exploitable');
ok(/TOP AMÉLIORATIONS/.test(out), 'l\'outil sort un backlog classé');
ok(/Declaration ≠ Deployment/.test(out), 'l\'outil mesure le code non-câblé (erreur #28)');
ok(/non mesuré/.test(out) || /paquets en retard/.test(out),
  'l\'outil est honnête sur ce qu\'il n\'a pas mesuré (jamais deviné)');

/* 2. La référence (ratchet) existe et porte les compteurs attendus. */
const BASE = 'tools/audit/improvements-baseline.json';
ok(existsSync(join(ROOT, BASE)), BASE + ' existe (sinon pas de ratchet possible)');
if (existsSync(join(ROOT, BASE))) {
  const m = JSON.parse(read(BASE)).metrics || {};
  for (const k of ['orphan_functions', 'duplicate_functions', 'innerhtml_no_esc', 'views_untested']) {
    ok(typeof m[k] === 'number', 'la référence contient le compteur ' + k);
  }
}

/* 3. Câblage npm : la passe doit être lançable ET dans le gate. */
const pkg = JSON.parse(read('package.json'));
ok(!!pkg.scripts['audit:improvements'], 'script npm audit:improvements câblé');
ok(!!pkg.scripts['audit:all'], 'script npm audit:all (stabilité + améliorations) câblé');
ok(/test:improvements-guard/.test(pkg.scripts['test:ci'] || ''), 'ce garde tourne dans test:ci');

/* 4. La règle est DÉCLARÉE (si la section disparaît de CLAUDE.md, la passe se perd). */
/* Depuis le découpage du 17.09.2026 (CLAUDE.md = index chargé à chaque message,
   CLAUDE-HISTOIRE.md = le récit complet), le DÉTAIL d'une règle vit dans le récit.
   Tout outil qui cherche du détail doit donc lire le récit, avec repli sur l'index. */
const FICHIER_REGLES = existsSync(join(ROOT, 'CLAUDE-HISTOIRE.md')) ? 'CLAUDE-HISTOIRE.md' : 'CLAUDE.md';
const claude = read(FICHIER_REGLES);
ok(/PASSE AMÉLIORATIONS TOTALES/.test(claude), 'CLAUDE.md déclare la PASSE AMÉLIORATIONS TOTALES');
ok(/11 axes obligatoires/.test(claude), 'CLAUDE.md compte bien 11 axes (l\'axe 9 est intégré)');
ok(/npm run audit:improvements/.test(claude), 'CLAUDE.md pointe la commande à lancer');
ok(/ratchet/i.test(claude), 'CLAUDE.md explique le ratchet (anti faux-rouge)');

/* 5. PARITÉ APEX — ce que Claude Code a, Apex l'a aussi (la règle manquée le 2026-08-09). */
const APEX = '.claude/skills/apex-audit-improvements.md';
ok(existsSync(join(ROOT, APEX)), APEX + ' existe (parité Apex de la passe)');
if (existsSync(join(ROOT, APEX))) {
  const a = read(APEX);
  ok(/audit:improvements/.test(a), 'le skill Apex pointe le même outil');
  ok(/ratchet/i.test(a), 'le skill Apex rappelle le ratchet');
  ok(/non mesuré/.test(a), 'le skill Apex impose « 🔴 non mesuré » plutôt que deviner');
}

/* 6. Le cap de skills d'Apex doit couvrir tous les .md à plat, sinon Apex en perd en SILENCE
      (mesuré le 2026-08-09 : 57 fichiers pour un cap de 45 → 12 skills invisibles pour Apex). */
const mem = read('apex-ai/v13/core/memory.ts');
const capM = mem.match(/folder === 'skills' \? (\d+) : \d+/);
ok(!!capM, 'le cap de skills est lisible dans memory.ts');
if (capM) {
  const cap = Number(capM[1]);
  const { readdirSync } = await import('node:fs');
  const flat = readdirSync(join(ROOT, '.claude/skills')).filter((f) => f.endsWith('.md')).length;
  ok(cap >= flat, 'cap Apex (' + cap + ') ≥ nombre de skills à plat (' + flat + ') — sinon '
    + (flat - cap) + ' skill(s) perdu(s) en silence');
}

/* 7. CONFORMITÉ DES RÈGLES — « vérifie que toutes tes règles soient respectées automatiquement »
      (Kevin 2026-08-09). L'outil doit exister, tourner, et son ratchet doit tenir : si une NOUVELLE
      règle est ajoutée à CLAUDE.md sans garde-fou, ce test vire au rouge. C'est le correctif de
      cause racine : une règle ne peut plus vivre uniquement dans un document. */
const RULES_TOOL = 'tools/audit/rules-compliance.cjs';
ok(existsSync(join(ROOT, RULES_TOOL)), RULES_TOOL + ' existe');
ok(!!pkg.scripts['audit:rules'], 'script npm audit:rules câblé');
let rout = '';
try {
  rout = execFileSync(process.execPath, [RULES_TOOL], { cwd: ROOT, timeout: 60_000 }).toString();
} catch (e) {
  rout = (e && e.stdout && e.stdout.toString()) || '';
  fails.push('conformité des règles en échec : une règle a été ajoutée SANS garde-fou automatique. '
    + (rout.split('\n').filter((l) => l.includes('❌')).join(' | ') || '(sortie vide)'));
}
ok(/CONFORMITÉ DES RÈGLES/.test(rout), 'l\'outil de conformité produit son tableau');
ok(/COMPORTEMENTAL/.test(rout), 'il distingue les règles non mécanisables (honnêteté)');
ok(existsSync(join(ROOT, 'tools/audit/rules-compliance-baseline.json')), 'la référence du ratchet règles existe');

console.log('\n' + (fails.length ? '❌' : '✅') + ' garde « passe améliorations » : ' + pass + ' vérif OK, '
  + fails.length + ' échec(s)');
for (const f of fails) console.log('   ❌ ' + f);
process.exit(fails.length ? 1 : 0);
