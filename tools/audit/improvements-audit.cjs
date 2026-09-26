#!/usr/bin/env node
/**
 * AUDIT « FULL AMÉLIORATIONS » — (Kevin 2026-08-09 : « intègre dans fais ton audit une audit
 * de full améliorations »). C'est l'axe 9 de la règle « FAIS L'AUDIT » (CLAUDE.md).
 *
 *   node tools/audit/improvements-audit.cjs                  → mesure + backlog classé
 *   node tools/audit/improvements-audit.cjs --deps           → + dépendances (réseau requis, CI)
 *   node tools/audit/improvements-audit.cjs --update-baseline → fige l'existant comme référence
 *
 * DIFFÉRENCE avec les autres passes : les autres cherchent ce qui est CASSÉ. Celle-ci cherche
 * ce qui MARCHE mais pourrait être MEILLEUR — et le chiffre. Un audit qui ne sort que des bugs
 * laisse l'app stagner (règle « TOUT AU MAX » + « va plus loin sans qu'on te le demande »).
 *
 * PRINCIPE ANTI-FAUX-ROUGE (ratchet, cf. CLAUDE.md protocole passe 2) : la dette existante est
 * figée dans improvements-baseline.json. On échoue UNIQUEMENT si un compteur AUGMENTE — donc le
 * nouveau code est bloqué sans allumer un rouge permanent sur l'ancien.
 *
 * Tout est MESURÉ (règle JAMAIS ESTIMER) : chaque ligne du backlog porte son chiffre réel.
 * Ce qui n'a pas pu être mesuré est marqué « 🔴 non mesuré » — jamais deviné.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML = path.join(ROOT, 'index.html');
const BASELINE = path.join(__dirname, 'improvements-baseline.json');
const ARGS = process.argv.slice(2);
const WITH_DEPS = ARGS.includes('--deps');
const UPDATE = ARGS.includes('--update-baseline');

const html = fs.readFileSync(HTML, 'utf8');
const lines = html.split('\n');

/* backlog : ce qu'on POURRAIT améliorer, chiffré + classé */
const backlog = [];
const add = (prio, titre, mesure, action) => backlog.push({ prio, titre, mesure, action });
const measured = {}; /* compteurs soumis au ratchet */

/* ─────────── 1. Code déclaré mais JAMAIS appelé (erreur #28 : Declaration ≠ Deployment) ───────────
   Un seul passage pour compter TOUS les identifiants (une regex par nom sur 1,8 Mo = inutilisable). */
const idCount = new Map();
{
  const idRe = /[A-Za-z_$][\w$]*/g;
  let t;
  while ((t = idRe.exec(html))) idCount.set(t[0], (idCount.get(t[0]) || 0) + 1);
}
const decl = new Map();
{
  const dRe = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = dRe.exec(html))) decl.set(m[1], (decl.get(m[1]) || 0) + 1);
}
/* orphelin = déclaré, et le nom n'apparaît nulle part ailleurs dans le fichier */
const orphans = [...decl.keys()].filter((n) => (idCount.get(n) || 0) <= (decl.get(n) || 1));
const orphanViews = orphans.filter((n) => /^v[A-Z]/.test(n));
measured.orphan_functions = orphans.length;
measured.orphan_views = orphanViews.length;

console.log('\n[1] Code déclaré mais jamais appelé (Declaration ≠ Deployment, erreur #28)');
console.log('     fonctions déclarées : ' + decl.size + ' · orphelines : ' + orphans.length +
  (orphanViews.length ? ' (dont ' + orphanViews.length + ' VUE(S) inatteignable(s))' : ''));
if (orphanViews.length) {
  console.log('     vues orphelines : ' + orphanViews.slice(0, 12).join(', '));
  add('P1', 'Vue(s) construite(s) mais inatteignable(s)', orphanViews.length + ' vue(s) : ' +
    orphanViews.slice(0, 8).join(', '), 'Router la vue (sv/route) OU la supprimer — du code mort invisible.');
}
if (orphans.length) {
  add('P2', 'Fonctions déclarées jamais appelées', orphans.length + ' fonction(s)',
    'Câbler ou supprimer. Chaque orpheline est du poids mort dans un fichier déjà lourd.');
}

/* ─────────── 2. Doublons de définition (2 implémentations du même nom = bug de maintenance) ─────── */
const dupes = [...decl.entries()].filter(([, c]) => c > 1).map(([n, c]) => n + '×' + c);
measured.duplicate_functions = dupes.length;
console.log('\n[2] Fonctions définies plusieurs fois (la 2e écrase la 1re en silence)');
console.log('     doublons : ' + dupes.length + (dupes.length ? ' → ' + dupes.slice(0, 10).join(', ') : ''));
if (dupes.length) {
  add('P1', 'Même fonction définie plusieurs fois', dupes.length + ' nom(s) : ' + dupes.slice(0, 6).join(', '),
    'Fusionner. La dernière définition gagne → un correctif appliqué à la 1re est invisible.');
}

/* ─────────── 3. Dette mesurable (ratchet : on bloque la HAUSSE, pas l'existant) ─────────── */
const count = (re) => (html.match(re) || []).length;
measured.inline_styles = count(/\sstyle="/g);
measured.todo_markers = count(/\b(?:TODO|FIXME|HACK|XXX)\b/g);
measured.console_log = count(/console\.log\(/g);
/* ⚠️ « innerHTML sans esc() » ne compte QUE ce qui peut vraiment etre une faille : une ligne
   qui injecte une DONNEE. Une ligne qui pose du TEXTE FIXE (`el.innerHTML = '<div>…</div>'`,
   aucune variable, aucun `${}`) ne peut rien injecter du tout -- la compter, c'etait gonfler
   la dette avec du bruit, et faire rougir le ratchet pour un texte statique ajoute ailleurs.
   MESURE du 17.09 : 117 lignes comptees, dont **43 de texte fixe** -> la vraie dette XSS est
   **74**. Une mesure fausse est pire que pas de mesure (lecon de la passe ameliorations du
   9.08) : on retire le bruit, ce qui RESSERRE le cliquet au lieu de le desserrer.
   Methode : on retire les chaines de caracteres de la partie droite ; s'il ne reste plus
   aucun identifiant, c'est du texte fixe. Un `'<b>' + nom + '</b>'` laisse `nom` -> compte. */
const estTexteFixe = (l) => {
  const i = l.search(/innerHTML\s*[+]?=/);
  if (i < 0) return false;
  let d = l.slice(l.indexOf('=', i) + 1);
  if (/\$\{/.test(d)) return false;                       /* gabarit avec interpolation */
  d = d.replace(/'(\\.|[^'\\])*'/g, '')
       .replace(/"(\\.|[^"\\])*"/g, '')
       .replace(/`[^`$]*`/g, '');
  return !/[A-Za-z_$]/.test(d);
};
measured.innerhtml_no_esc = lines.filter((l) => /innerHTML\s*[+]?=/.test(l)
  && !/esc\(|escapeHtml\(|textContent/.test(l) && !estTexteFixe(l)).length;
measured.file_kb = Math.round(Buffer.byteLength(html) / 1024);

console.log('\n[3] Dette mesurée (chiffres réels, ratchet sur la hausse)');
for (const k of ['file_kb', 'inline_styles', 'innerhtml_no_esc', 'todo_markers', 'console_log']) {
  console.log('     ' + k.padEnd(20) + ' = ' + measured[k]);
}
if (measured.inline_styles > 500) {
  add('P3', 'Styles en dur dans le HTML', measured.inline_styles + ' occurrences de style="',
    'Basculer vers des classes CSS : thème cohérent + fichier plus léger + dark mode gratuit.');
}
if (measured.innerhtml_no_esc > 0) {
  add('P1', 'innerHTML sans échappement visible', measured.innerhtml_no_esc + ' ligne(s)',
    'Vérifier chacune : donnée utilisateur → esc(). Sinon XSS. (Le garde xss-guard fige déjà l\'existant.)');
}

/* ─────────── 4. Fuites probables : minuteries et écouteurs jamais arrêtés (axe Performance) ─────── */
measured.set_interval = count(/setInterval\(/g);
measured.clear_interval = count(/clearInterval\(/g);
measured.add_listener = count(/addEventListener\(/g);
measured.remove_listener = count(/removeEventListener\(/g);
const intervalGap = Math.max(0, measured.set_interval - measured.clear_interval);
console.log('\n[4] Minuteries / écouteurs (fuites mémoire, intervals zombies)');
console.log('     setInterval ' + measured.set_interval + ' vs clearInterval ' + measured.clear_interval +
  ' · addEventListener ' + measured.add_listener + ' vs removeEventListener ' + measured.remove_listener);
if (intervalGap > 0) {
  add('P2', 'Minuteries sans arrêt correspondant', intervalGap + ' setInterval de plus que de clearInterval',
    'Garder l\'id et clearInterval au démontage/logout — sinon elles tournent pour rien (batterie iPhone).');
}

/* ─────────── 5. Couverture : vues jamais citées par un test ─────────── */
const views = [...decl.keys()].filter((n) => /^v[A-Z]/.test(n));
let testsBlob = '';
for (const dir of ['tests']) {
  const d = path.join(ROOT, dir);
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d)) {
    if (!/\.(mjs|js|cjs)$/.test(f)) continue;
    const p = path.join(d, f);
    try {
      if (fs.statSync(p).size < 600_000) testsBlob += fs.readFileSync(p, 'utf8');
    } catch { /* fichier illisible : ignoré, compté comme non couvrant */ }
  }
}
/* Une vue est couverte si les tests citent SON NOM (vAccueil) OU SA ROUTE ('accueil') — le smoke
   runtime-audit-render-all-views.mjs liste les routes en minuscules, pas les noms de fonctions.
   Sans ce 2e cas, on compterait 85 vues « non testées » alors que 94 routes SONT rendues :
   faux positif (mesuré et corrigé le 2026-08-09 avant de figer la référence). */
const untested = views.filter((v) => {
  if (testsBlob.includes(v)) return false;
  const route = v.slice(1).toLowerCase();
  return !(testsBlob.includes("'" + route + "'") || testsBlob.includes('"' + route + '"'));
});
measured.views_total = views.length;
measured.views_untested = untested.length;
console.log('\n[5] Couverture des vues par les tests (par nom de fonction OU par route)');
console.log('     vues : ' + views.length + ' · non couvertes : ' + untested.length +
  (untested.length ? ' → ' + untested.slice(0, 10).join(', ') : ''));
if (untested.length) {
  add('P2', 'Vues jamais couvertes par un test', untested.length + '/' + views.length + ' vues',
    'Les ajouter au smoke test:render-views — une vue non listée est une vue non testée (règle audit §4).');
}

/* ─────────── 6. Dépendances (réseau requis → honnête si non mesuré) ─────────── */
console.log('\n[6] Dépendances (mises à jour / vulnérabilités)');
if (WITH_DEPS) {
  const { execSync } = require('child_process');
  const run = (cmd) => {
    try {
      return execSync(cmd, { cwd: ROOT, timeout: 120_000, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    } catch (e) {
      /* npm outdated/audit sortent en code ≠ 0 quand il Y A des résultats : on lit quand même */
      return (e && e.stdout && e.stdout.toString()) || '';
    }
  };
  let outdated = 0, vulns = 0;
  try { outdated = Object.keys(JSON.parse(run('npm outdated --json') || '{}')).length; } catch { outdated = -1; }
  try {
    const a = JSON.parse(run('npm audit --json') || '{}');
    vulns = (a.metadata && a.metadata.vulnerabilities && a.metadata.vulnerabilities.total) || 0;
  } catch { vulns = -1; }
  console.log('     paquets en retard : ' + (outdated < 0 ? '🔴 non mesuré' : outdated) +
    ' · vulnérabilités : ' + (vulns < 0 ? '🔴 non mesuré' : vulns));
  if (outdated > 0) add('P2', 'Paquets en retard de version', outdated + ' paquet(s)', 'npm outdated puis monter les mineures sûres.');
  if (vulns > 0) add('P0', 'Vulnérabilités de dépendances', vulns + ' remontée(s) par npm audit', 'Corriger AVANT tout le reste (axe Sécurité).');
} else {
  console.log('     🔴 non mesuré (réseau) — relancer avec --deps en CI. Jamais deviné.');
}

/* ─────────── 7. Ratchet ─────────── */
const RATCHETED = ['orphan_functions', 'orphan_views', 'duplicate_functions', 'innerhtml_no_esc',
  'todo_markers', 'console_log', 'views_untested'];
let fails = 0;
if (UPDATE) {
  fs.writeFileSync(BASELINE, JSON.stringify({
    _note: 'Référence figée de la dette existante. On échoue si un compteur AUGMENTE (jamais parce ' +
      'que la dette existe). Régénérer volontairement : node tools/audit/improvements-audit.cjs --update-baseline',
    updated: new Date().toISOString().slice(0, 10),
    metrics: measured,
  }, null, 2) + '\n');
  console.log('\n[7] Référence mise à jour → ' + path.relative(ROOT, BASELINE));
} else if (fs.existsSync(BASELINE)) {
  const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).metrics || {};
  console.log('\n[7] Ratchet (échec seulement si ça EMPIRE)');
  for (const k of RATCHETED) {
    const now = measured[k], was = base[k];
    if (typeof was !== 'number') { console.log('  ⚠️  ' + k + ' : pas de référence (nouveau compteur)'); continue; }
    if (now > was) { console.log('  ❌ ' + k + ' : ' + was + ' → ' + now + ' (EN HAUSSE)'); fails++; }
    else if (now < was) console.log('  ✅ ' + k + ' : ' + was + ' → ' + now + ' (amélioré 🎉)');
    else console.log('  ✅ ' + k + ' : ' + now + ' (stable)');
  }
} else {
  console.log('\n[7] Aucune référence — lancer une fois avec --update-baseline.');
}

/* ─────────── 8. Backlog classé ─────────── */
const ordre = { P0: 0, P1: 1, P2: 2, P3: 3 };
backlog.sort((a, b) => ordre[a.prio] - ordre[b.prio]);
console.log('\n══════ TOP AMÉLIORATIONS (classées, chiffrées) ══════');
if (!backlog.length) console.log('  ✅ Rien à améliorer sur les points mesurés ici.');
backlog.forEach((b, i) => {
  console.log('\n  ' + (i + 1) + '. [' + b.prio + '] ' + b.titre);
  console.log('     mesure : ' + b.mesure);
  console.log('     action : ' + b.action);
});
console.log('\n' + (fails ? '❌ ' + fails + ' compteur(s) en hausse — la dette AUGMENTE, corriger avant de pousser.'
  : '✅ Aucun compteur en hausse.') + ' Backlog : ' + backlog.length + ' amélioration(s) chiffrée(s).\n');
process.exit(fails ? 1 : 0);
