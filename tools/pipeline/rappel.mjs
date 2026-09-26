#!/usr/bin/env node
/* RAPPEL — « ce que j'ai, ce que je dois, ce que je fais », mesuré, jamais supposé.
 * ===========================================================================
 * Kevin 2026-09-03 : « Crée un loop qui reprend tes skills, hooks et scripts
 * pour toujours te rappeler tout de tout ce que tu as, ce que tu dois, ce que
 * tu fais, etc. »
 *
 * Le problème réel qu'il résout : les repères sont éparpillés — 138 règles
 * absolues dans CLAUDE.md, 174 leçons dans LESSONS.md, ~95 skills, 129 scripts
 * npm, 4 hooks, 17 sessions avec leur courrier. Personne (moi le premier) ne
 * relit tout ça à chaque fois : on oublie, et on refait une erreur déjà écrite.
 *
 * Principe pour que ce soit tenable :
 *   - ce qui est ACTIONNABLE est montré EN ENTIER, à chaque fois (ce que Kevin
 *     attend, le courrier des autres sessions, l'état git, les gardes rouges) ;
 *   - ce qui est ÉNORME (règles, leçons) est montré par ROTATION : quelques
 *     lignes différentes à chaque exécution, si bien qu'au fil des tours tout
 *     finit par repasser — sans coûter un roman à chaque fois.
 *   - rien n'est inventé : chaque chiffre est compté sur le disque, à l'instant.
 *
 * Usage :
 *   node tools/pipeline/rappel.mjs                  # le rappel (compact)
 *   node tools/pipeline/rappel.mjs --tout           # tout, sans rotation
 *   node tools/pipeline/rappel.mjs --pour "departs" # ce qui touche un sujet
 *   node tools/pipeline/rappel.mjs --court          # 12 lignes (hook de démarrage)
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const ARG = process.argv.slice(2);
const TOUT = ARG.includes('--tout');
const COURT = ARG.includes('--court');
const SUJET = (() => { const i = ARG.indexOf('--pour'); return i >= 0 ? (ARG[i + 1] || '').toLowerCase() : ''; })();
const ETAT = 'pipeline/rappel-etat.json';

const lire = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
const sh = (c, a) => { try { return execFileSync(c, a, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const compter = (d, filtre = () => true) => {
  try { return readdirSync(d).filter(filtre).length; } catch { return 0; }
};

/* ─── 1. Où je suis, qui je suis ─────────────────────────────────────────── */
const branche = sh('git', ['branch', '--show-current']);
const reg = (() => { try { return JSON.parse(lire('pipeline/sessions.json')); } catch { return { sessions: {}, messages: [] }; } })();
const monId = Object.entries(reg.sessions || {}).find(([, s]) => s.branche === branche)?.[0] || null;
const moi = monId ? reg.sessions[monId] : null;

const nonPousses = Number(sh('git', ['rev-list', `origin/${branche}..HEAD`, '--count']) || 0);
const saleté = sh('git', ['status', '--porcelain']).split('\n').filter(Boolean).length;
const remoteOrigin = sh('git', ['remote', 'get-url', 'origin']).replace(/\/\/[^@/]*@/, '//***@');

/* ─── 2. Ce que je DOIS (actionnable — toujours en entier) ───────────────── */
const attendKevin = Object.entries(reg.sessions || {}).filter(([, s]) => s.attend_kevin);
/* mon propre courrier ne m'apprend rien : on ne garde que ce qui vient des AUTRES */
const courrier = (reg.messages || []).filter(
  (m) => m.etat !== 'clos' && m.de !== monId && (m.a === monId || m.a === 'toutes')
);
const jeBloque = Object.entries(reg.sessions || {}).filter(
  ([, s]) => s.attend_session && monId && String(s.attend_session).startsWith(monId)
);

/* ─── 3. Ce que j'AI (compté sur le disque) ──────────────────────────────── */
const skillsProjet = compter('.claude/skills', (f) => !f.startsWith('_') && f !== 'README.md');
const outils = compter('tools', (f) => { try { return statSync(join('tools', f)).isDirectory(); } catch { return false; } });
const pkg = (() => { try { return JSON.parse(lire('package.json')); } catch { return { scripts: {} }; } })();
const scripts = Object.keys(pkg.scripts || {});
const gate = [...(pkg.scripts?.['test:ci'] || '').matchAll(/(?:test|audit|verifie|secours|migrer):[a-z0-9-]+/g)].map((m) => m[0]);

const hooks = (() => {
  const out = [];
  for (const f of ['.claude/settings.json', '.claude/settings.local.json']) {
    let j; try { j = JSON.parse(lire(f)); } catch { continue; }
    for (const [evt, liste] of Object.entries(j.hooks || {})) {
      for (const g of liste) for (const h of g.hooks || []) {
        const c = String(h.command || '').replace(/\s+/g, ' ');
        out.push({ evt, quoi: c.length > 66 ? c.slice(0, 63) + '…' : c });
      }
    }
  }
  for (const f of ['session-start-git-identity.sh', 'stop-hook-git-check.sh'])
    if (existsSync(join(process.env.HOME || '/root', '.claude', f)))
      out.push({ evt: f.includes('stop') ? 'Stop' : 'SessionStart', quoi: `~/.claude/${f} (harnais)` });
  return out;
})();

/* ─── 4. Ce que je ne dois JAMAIS oublier (rotation) ─────────────────────── */
const FICHIER_REGLES = existsSync('CLAUDE-HISTOIRE.md') ? 'CLAUDE-HISTOIRE.md' : 'CLAUDE.md';
const regles = [...lire(FICHIER_REGLES).matchAll(/^## .*?RÈGLE [A-ZÉ]+ *— *(.+)$/gm)]
  .map((m) => m[1].replace(/\*\*/g, '').replace(/\s*\(Kevin[^)]*\)\s*$/, '').trim());
const lecons = [...lire('LESSONS.md').matchAll(/^(\d+)\. \*\*(.+?)(?:\s*\(|\*\*)/gm)]
  .map((m) => ({ n: Number(m[1]), t: m[2].slice(0, 120) }));

/* rotation : un curseur persistant → à chaque tour, d'autres lignes remontent */
let curseur = 0;
try { curseur = JSON.parse(lire(ETAT)).curseur || 0; } catch { /* premier tour */ }
const tranche = (arr, n) => (arr.length ? Array.from({ length: Math.min(n, arr.length) }, (_, i) => arr[(curseur + i) % arr.length]) : []);

/* ─── 5. Recherche par sujet (--pour) ────────────────────────────────────── */
if (SUJET) {
  /* « departs » doit retrouver « DÉPARTS » : on replie les accents des deux côtés */
  const plat = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const q = plat(SUJET);
  const trouve = (arr, f) => arr.filter((x) => plat(f(x)).includes(q));
  console.log(`\n🔎 « ${SUJET} » — ce que j'ai déjà écrit là-dessus\n`);
  const r = trouve(regles, (x) => x);
  const l = trouve(lecons, (x) => x.t);
  const s = trouve(scripts, (x) => x);
  if (r.length) { console.log(`  RÈGLES (${r.length})`); r.slice(0, 8).forEach((x) => console.log(`    · ${x}`)); }
  if (l.length) { console.log(`\n  LEÇONS (${l.length})`); l.slice(0, 8).forEach((x) => console.log(`    · #${x.n} ${x.t}`)); }
  if (s.length) { console.log(`\n  SCRIPTS (${s.length})`); console.log(`    ${s.slice(0, 12).map((x) => 'npm run ' + x).join('\n    ')}`); }
  /* Les catalogues vendorisés (paliers gratuits, IA gratuites) : on cherche
     dedans hors ligne, et on ne montre que les lignes qui parlent du sujet. */
  const CATALOGUES = [
    ['services gratuits (free-for.dev)', 'vendor/agent-toolkit/free-for-dev/README.md'],
    ['IA gratuites', 'vendor/agent-toolkit/free-llm-api-resources/README.md'],
  ];
  for (const [titre, f] of CATALOGUES) {
    const txt = lire(f);
    if (!txt) continue;
    const lignes = txt.split('\n')
      .filter((x) => plat(x).includes(q) && /^\s*[*|#]/.test(x) && x.length > 40)
      .map((x) => x.replace(/^\s*[*|]\s*/, '').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 → $2').slice(0, 150));
    if (lignes.length) {
      console.log(`\n  ${titre.toUpperCase()} (${lignes.length})`);
      lignes.slice(0, 6).forEach((x) => console.log(`    · ${x}`));
      if (lignes.length > 6) console.log(`    … +${lignes.length - 6} — grep -i "${SUJET}" ${f}`);
    }
  }

  if (!r.length && !l.length && !s.length) console.log('\n  (aucune règle, leçon ni script — vois les catalogues ci-dessus)');
  console.log(`\n  Voir aussi : node tools/memory/mem.cjs search "${SUJET}" --k 5\n`);
  process.exit(0);
}

/* ─── 6. Affichage ───────────────────────────────────────────────────────── */
const L = [];
L.push('');
L.push(`╭─ RAPPEL ─ ${new Date().toISOString().slice(0, 16).replace('T', ' ')} ─────────────────────────────`);
L.push(`│ Session : ${moi ? `${moi.titre} (${monId})` : `⚠ branche « ${branche} » PAS au registre`}`);
if (moi) L.push(`│ Terrain : ${(moi.surfaces || []).join(', ') || '—'}`);
L.push(`│ Git     : ${branche} · ${nonPousses ? `⚠ ${nonPousses} commit(s) à pousser` : 'tout est publié ✓'}`
  + ` · ${saleté} fichier(s) en cours`);
L.push(remoteOrigin.includes('gitlab')
  ? `│ Publier : GITLAB_TOKEN=… ./tools/pipeline/pousser.sh   (origin = GitLab)`
  : `│ Publier : git push -u origin ${branche} → PR → fusion par l'API (GitHub, voie normale depuis le 4.09) · GitLab = remise à niveau occasionnelle seulement (ETAT-INFRA fait n°13)`);
L.push('╰──────────────────────────────────────────────────────────────────────');

/* CE QUE JE DOIS — jamais tronqué */
L.push('');
L.push('▸ CE QUE JE DOIS');
if (!attendKevin.length && !courrier.length && !jeBloque.length) L.push('   rien en attente. ✓');
attendKevin.forEach(([id, s]) => L.push(`   👤 Kevin doit : ${s.attend_kevin}   [${id}]`));
jeBloque.forEach(([id, s]) => L.push(`   🔗 ${id} m'attend : ${String(s.attend_session).replace(/^[^:]*:\s*/, '')}`));
courrier.forEach((m) => L.push(`   ✉  ${m.id} de ${m.de} : ${m.sujet}`));

/* CE QUE J'AI */
if (!COURT) {
  L.push('');
  L.push('▸ CE QUE J\'AI');
  L.push(`   ${skillsProjet} skills · ${outils} outils dans tools/ · ${scripts.length} scripts npm · ${gate.length} gardes dans test:ci`);
  L.push(`   ${regles.length} règles absolues (CLAUDE.md) · ${lecons.length} leçons (LESSONS.md) · mémoire compacte : tools/memory/mem.cjs`);
  L.push('   Hooks actifs :');
  hooks.forEach((h) => L.push(`     ${h.evt.padEnd(12)} ${h.quoi}`));
}

/* CE QUE JE NE DOIS PAS OUBLIER — rotation */
if (!COURT) {
  const nR = TOUT ? regles.length : 5;
  const nL = TOUT ? lecons.length : 4;
  L.push('');
  L.push(`▸ RÈGLES ${TOUT ? '(toutes)' : `(${nR} sur ${regles.length}, elles tournent à chaque rappel)`}`);
  tranche(regles, nR).forEach((r) => L.push(`   · ${r}`));
  L.push('');
  L.push(`▸ LEÇONS ${TOUT ? '(toutes)' : `(${nL} sur ${lecons.length}, elles tournent aussi)`}`);
  tranche(lecons, nL).forEach((x) => L.push(`   · #${x.n} ${x.t}`));
}

L.push('');
L.push('▸ POUR CREUSER');
L.push('   node tools/pipeline/rappel.mjs --pour "<sujet>"    ce que j\'ai déjà écrit là-dessus');
L.push('   node tools/pipeline/rappel.mjs --tout              toutes les règles et leçons');
L.push('   node tools/pipeline/pipeline.mjs etat --id ' + (monId || '<moi>') + '   le détail des 17 sessions');
L.push('');
console.log(L.join('\n'));

/* avance le curseur pour que le prochain rappel montre AUTRE chose */
if (!TOUT && !COURT) {
  try { writeFileSync(ETAT, JSON.stringify({ curseur: (curseur + 5) % Math.max(regles.length, 1), maj: new Date().toISOString().slice(0, 10) }, null, 2) + '\n'); } catch { /* lecture seule : tant pis, pas bloquant */ }
}
