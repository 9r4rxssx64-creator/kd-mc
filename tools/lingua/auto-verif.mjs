/* 🔁 VÉRIFICATION AUTOMATIQUE + CORRECTION AUTOMATIQUE — Kevin 2026-08-13
   « Vérifie régulièrement et auto les réponses pour corriger auto. Intègres toutes les vérif
   auto et corrections auto. »

   IDÉE : une seule commande qui passe TOUS les contrôles de l'app, et qui RÉPARE tout seul ce
   qui est réparable sans risque. Ce qui n'est pas réparable sans jugement humain est signalé,
   jamais bricolé en douce.

     node tools/lingua/auto-verif.mjs            → contrôle seulement (n'écrit rien)
     node tools/lingua/auto-verif.mjs --corrige  → contrôle ET répare ce qui est sûr

   RÈGLE DE PRUDENCE (« jamais régresser ») : une correction automatique n'est appliquée QUE si
   elle est mécanique et vérifiable — jamais une réécriture de contenu « au jugé ». Chaque
   réparation est journalisée pour être relue.
*/
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const CORRIGE = process.argv.includes('--corrige');
const R = new URL('../../', import.meta.url).pathname;      // racine du dépôt
const lire = (p) => readFileSync(R + p, 'utf8');
const ecrire = (p, s) => writeFileSync(R + p, s, 'utf8');

const soucis = [];   // { gravite:'bloquant'|'signale', quoi, detail, repare? }
const repares = [];
const ok = (m, d) => console.log('✅ ' + m + (d != null ? ' → ' + d : ''));
const ko = (gravite, quoi, detail) => { soucis.push({ gravite, quoi, detail }); console.log((gravite === 'bloquant' ? '❌ ' : '⚠️ ') + quoi + (detail ? ' → ' + detail : '')); };

/* ---------- 1. Les contrôles qui existent déjà, tous lancés d'un coup ---------- */
const SCRIPTS = [
  { nom: 'Vérité du contenu (6 langues, quiz, 0 doublon)', cmd: ['tools/lingua/verify-truth.mjs', 'lingua', '--struct'] },
  { nom: 'Le Coach reste utilisable (micro, cases, consignes)', cmd: ['tools/lingua/verify-coach.mjs'] },
  { nom: 'La voix du monégasque dit juste (cas documentés)', cmd: ['tools/lingua/verify-mc-voix.mjs'] },
  { nom: 'La voix ne se dégrade plus question après question', cmd: ['tools/lingua/verify-voix.mjs', 'lingua'] },
  { nom: 'Histoire & anecdotes : toutes sourcées et bien branchées', cmd: ['tools/lingua/verify-histoires.mjs', 'lingua'] },
  { nom: 'Langue des signes : aucun signe inventé, aucune question qui donne sa réponse', cmd: ['tools/lingua/verify-lsf.mjs', 'lingua'] },
  { nom: 'Aucune image demandée dans le vide (0 requête 404)', cmd: ['tools/lingua/verify-assets.mjs', 'lingua'] },
  { nom: 'Sources officielles : bien formées et branchées', cmd: ['tools/lingua/verify-sources.mjs', 'lingua'] },
  { nom: 'Moteur de voix du serveur', cmd: ['services/kdmc-router/voix-tts.test.mjs'] },
  { nom: 'Voix clonée d\'Antonin', cmd: ['services/kdmc-router/antonin-tts.test.mjs'] },
];
console.log('== Contrôles ==');
for (const s of SCRIPTS) {
  if (!existsSync(R + s.cmd[0])) { ko('signale', s.nom, 'script absent : ' + s.cmd[0]); continue; }
  try { execFileSync('node', s.cmd.map((c, i) => (i === 0 ? R + c : c)), { cwd: R, stdio: 'pipe' }); ok(s.nom); }
  catch (e) {
    const sortie = ((e.stdout || '') + '' + (e.stderr || '')).split('\n').filter((l) => /✗|❌|Error|failed/.test(l)).slice(0, 4).join(' | ');
    ko('bloquant', s.nom, sortie.slice(0, 300) || 'échec');
  }
}

/* ---------- 2. Réparations mécaniques (sûres) ---------- */
console.log('\n== Réparations automatiques ==');

/* 2a. La version du cache doit suivre la version de l'app, sinon l'iPhone garde l'ancienne
       version en mémoire et Kevin ne voit RIEN de ce qu'on livre (erreur déjà vécue). */
try {
  const app = lire('lingua/app.js'), sw = lire('lingua/sw.js');
  const v = (app.match(/var APP_VER\s*=\s*"([^"]+)"/) || [])[1];
  const c = (sw.match(/var CACHE\s*=\s*"lingua-([^"]+)"/) || [])[1];
  if (!v || !c) ko('signale', 'Version introuvable', 'app=' + v + ' cache=' + c);
  else if (v !== c) {
    if (CORRIGE) { ecrire('lingua/sw.js', sw.replace(/var CACHE\s*=\s*"lingua-[^"]+"/, 'var CACHE = "lingua-' + v + '"')); repares.push('cache remis sur ' + v + ' (était ' + c + ')'); console.log('🔧 cache ' + c + ' → ' + v); }
    else ko('bloquant', 'Le cache ne suit pas la version', c + ' ≠ ' + v + ' (réparable : --corrige)');
  } else ok('La version du cache suit celle de l\'app', v);
} catch (e) { ko('signale', 'Lecture des versions', String(e.message).slice(0, 120)); }

/* 2b. Un mot monégasque publié doit rester ATTESTÉ dans les sources récoltées. Si une source
       disparaît ou se corrige, on retire l'entrée plutôt que de laisser du faux en ligne. */
const SRC = 'lingua/monegasque-sources.json';
if (existsSync(R + SRC)) {
  try {
    const src = JSON.parse(lire(SRC));
    const atteste = new Set(Object.keys(src.entrees || {}));
    /* Le cours monégasque vit dans son propre fichier ENGENDRÉ (lingua/data-mc.js), pas dans
       data.js : c'est là qu'il faut regarder. Piège vécu le 2026-08-13 — en cherchant au
       mauvais endroit, le contrôle annonçait « rien de publié » alors que 650 mots l'étaient :
       un contrôle qui regarde à côté ment en vert. */
    const data = existsSync(R + 'lingua/data-mc.js') ? lire('lingua/data-mc.js') : lire('lingua/data.js');
    const bloc = (data.match(/var LEX3\s*=\s*\{[\s\S]*?\};/) || [])[0] || '';
    const publies = [...bloc.matchAll(/"([^"]+)"\s*:\s*"([^"]*)"/g)].map((m) => m[1]);
    const orphelins = publies.filter((fr) => !atteste.has(fr));
    if (!publies.length) ok('Monégasque : rien de publié pour l\'instant');
    else if (!orphelins.length) ok('Monégasque : chaque mot publié est attesté', publies.length + ' mot(s)');
    else ko('bloquant', 'Monégasque : mots publiés SANS source', orphelins.slice(0, 8).join(', ') + (orphelins.length > 8 ? '…' : ''));
  } catch (e) { ko('signale', 'Lecture des sources monégasques', String(e.message).slice(0, 120)); }
} else console.log('·  Monégasque : pas encore de fichier de sources (' + SRC + ')');

/* ---------- 3. Verdict ---------- */
const bloquants = soucis.filter((s) => s.gravite === 'bloquant');
console.log('\n===== BILAN =====');
console.log('réparations appliquées : ' + repares.length + (repares.length ? ' → ' + repares.join(' ; ') : ''));
console.log('problèmes bloquants    : ' + bloquants.length);
console.log('points signalés        : ' + (soucis.length - bloquants.length));
if (CORRIGE) {
  writeFileSync(R + 'audit/auto-verif-dernier.json', JSON.stringify({ le: new Date().toISOString(), repares, soucis }, null, 2), 'utf8');
}
process.exit(bloquants.length ? 1 : 0);
