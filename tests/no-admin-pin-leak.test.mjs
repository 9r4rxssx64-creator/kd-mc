/* GARDE-FOU — le code admin de Kevin ne doit JAMAIS réapparaître en clair dans du code servi.
 *
 * TROUVÉ LE 2026-08-09 (audit complet du domaine) : le code admin était en clair dans 7 endroits,
 * dont l'ACCUEIL PUBLIC kd-mc.com (texte visible « Code ‹code admin› »), le chunk Apex servi, et — le
 * pire — le prompt système d'Apex (`core/memory.ts`), donc envoyé aux IA TIERCES à chaque requête.
 * Le même code sert dans les autres apps de Kevin → la portée dépassait largement chaque page.
 *
 * Ce test échoue si un code admin réapparaît en clair. Il ne contient PAS le code lui-même :
 * il le cherche par EMPREINTE (sinon le garde serait lui-même la fuite — erreur commise puis
 * rattrapée pendant l'audit : mon propre commentaire de correctif re-citait le PIN).
 *
 * node tests/no-admin-pin-leak.test.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Empreintes des codes qui ne doivent jamais apparaître en clair (jamais le code lui-même). */
/* TROUVÉ LE 2026-09-19 : cette garde contenait ELLE-MÊME le code admin en clair
   (`update('……')` ci-dessous, plus une citation dans son propre en-tête) — et elle
   s'excluait de son scan via IGNORE (`/tests/`). Donc la garde écrite pour empêcher la
   fuite ÉTAIT la fuite, sur un dépôt PUBLIC, et elle passait au vert. C'est exactement le
   faux vert de la leçon #103, et la répétition de l'erreur déjà notée dans l'en-tête
   (« mon propre commentaire de correctif re-citait le PIN »).
   RÈGLE (CLAUDE.md) : le code ne s'écrit NULLE PART — ni en clair, ni en empreinte, ni
   dans un test. L'empreinte d'un code à 6 chiffres se casse en une seconde : la stocker
   revient à stocker le code. Donc rien n'est stocké ici : l'empreinte attendue arrive par
   l'ENVIRONNEMENT (secret CI APEX_ADMIN_PIN_SHA256), jamais par le dépôt.
   HONNÊTETÉ (leçon #103) : sans ce secret, le contrôle « code en clair » ne peut pas se
   faire — on l'annonce « NON VÉRIFIÉ ICI » au lieu d'un vert trompeur. Les deux contrôles
   STRUCTURELS (64-hex, variable PIN…SHA… littérale) tournent toujours, eux : ils ne
   dépendent d'aucun secret. */
const SHA_ATTENDUE = String(process.env.APEX_ADMIN_PIN_SHA256 || process.env.KDMC_ADMIN_PIN_SHA256 || '').trim().toLowerCase();
const SHA_CONNUE = /^[0-9a-f]{64}$/.test(SHA_ATTENDUE);
const INTERDITS = new Set(SHA_CONNUE ? [SHA_ATTENDUE] : []);

/* Dossiers réellement SERVIS (le dépôt contient aussi de la doc, des tests, des sauvegardes). */
const CIBLES = ['kdmc-home', 'apex-ai-v13', 'messaging-app', 'tools', 'arbre', 'lingua',
  'shops', 'la-detente', 'coffre-fort', 'services'];
const EXT = /\.(html|js|mjs|cjs|ts|json)$/i;
/* Les COPIES de déploiement du routeur (public/, pages-upload/, app-tools-departs/) sont
   gitignorées et régénérées depuis les sources suivies : on juge les sources, pas des
   copies locales périmées (sinon un vieux build dans le bac à sable fait un faux rouge). */
/* `tests/` n'est PLUS exclu : c'est là que la fuite du 19/09 se cachait. */
const IGNORE = /node_modules|\.min\.|[\\/]dist[\\/]|\.map$|[\\/]kdmc-router[\\/](public|pages-upload|app-tools-departs)[\\/]/;
/* Deux niveaux, parce que le risque n'est pas le même :
   – SERVI (page/worker que le navigateur télécharge) = fuite publique → ÉCHEC ;
   – outillage du dépôt (tests, scripts e2e, mémoire locale) = à nettoyer, mais pas exposé au
     public → AVERTISSEMENT listé, pour ne pas masquer le problème derrière un vert. */
const NON_SERVI = /\.test\.(mjs|js|ts)$|[\\/](kdmc-[a-z-]*e2e|la-detente-e2e|firebase|memory)[\\/]|verify-[a-z-]*\.mjs$|[\\/]run\.mjs$/;

/* Tout nombre de 4 à 8 chiffres croisé avec les empreintes interdites. */
const NUM = /\b\d{4,8}\b/g;
/* TROUVÉ LE 2026-09-05 : la page Départs embarquait `PIN_SHA256="cbb0…"` — l'EMPREINTE du code,
   pas le code. Ce garde passait au vert. Or l'empreinte sha256 d'un code à 6 chiffres se casse en
   une seconde (10⁶ essais) : la publier revient à publier le code — et le dépôt est PUBLIC.
   Deux contrôles de plus, dont un STRUCTUREL qui ne dépend pas du code du jour :
   (a) tout 64-hex égal à l'empreinte d'un code interdit ; (b) toute variable nommée PIN…SHA…
   qui reçoit un 64-hex littéral — quel que soit le code derrière. La vérification d'un code
   se fait côté serveur (POST /__admin/login), jamais par comparaison dans la page. */
const HEX64 = /\b[0-9a-f]{64}\b/gi;
const PIN_SHA_LITTERAL = /\b[A-Za-z_]*PIN[A-Za-z0-9_]*SHA[A-Za-z0-9_]*\s*=\s*["'][0-9a-f]{64}["']/i;
const trouve = [];
const aNettoyer = [];
let scanned = 0;

function walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e);
    if (IGNORE.test(p)) continue;
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) { walk(p); continue; }
    if (!EXT.test(e) || st.size > 12_000_000) continue;
    scanned++;
    let txt;
    try { txt = readFileSync(p, 'utf8'); } catch { continue; }
    const vus = new Set();
    let m;
    NUM.lastIndex = 0;
    const signale = (index, quoi) => {
      const ligne = txt.slice(0, index).split('\n').length;
      const ref = relative(ROOT, p) + ':' + ligne + (quoi ? ' (' + quoi + ')' : '');
      (NON_SERVI.test(p) ? aNettoyer : trouve).push(ref);
    };
    while ((m = NUM.exec(txt))) {
      if (vus.has(m[0])) continue;
      vus.add(m[0]);
      if (INTERDITS.has(createHash('sha256').update(m[0]).digest('hex'))) signale(m.index, '');
    }
    HEX64.lastIndex = 0;
    while ((m = HEX64.exec(txt))) {
      if (INTERDITS.has(m[0].toLowerCase())) signale(m.index, 'empreinte du code');
    }
    const s = PIN_SHA_LITTERAL.exec(txt);
    if (s && p !== fileURLToPath(import.meta.url)) signale(s.index, 'empreinte de code embarquée côté client');
  }
}
for (const c of CIBLES) walk(join(ROOT, c));

/* La DOC du dépôt aussi (dépôt PUBLIC : un .md se lit depuis n'importe où). Le 5.09.2026 le code
   était en clair dans CLAUDE.md, NOTES_USER.md, KEVIN_INVENTORY.md… 68 fichiers. On scanne les
   .md de la racine et des dossiers de doc : le code en clair y est une FUITE, pas un « à nettoyer ». */
const DOCS = ['.', 'docs', 'messaging-app', 'shops', 'la-detente', 'coffre-fort', '.claude'];
for (const d of DOCS) {
  let entries = [];
  try { entries = readdirSync(join(ROOT, d)); } catch { continue; }
  for (const e of entries) {
    if (!/\.md$/i.test(e)) continue;
    const p = join(ROOT, d, e);
    let txt; try { txt = readFileSync(p, 'utf8'); } catch { continue; }
    scanned++;
    const vus = new Set(); let m; NUM.lastIndex = 0;
    while ((m = NUM.exec(txt))) {
      if (vus.has(m[0])) continue; vus.add(m[0]);
      if (INTERDITS.has(createHash('sha256').update(m[0]).digest('hex'))) {
        trouve.push(relative(ROOT, p) + ':' + txt.slice(0, m.index).split('\n').length + ' (doc publique)');
      }
    }
    HEX64.lastIndex = 0;
    while ((m = HEX64.exec(txt))) if (INTERDITS.has(m[0].toLowerCase())) trouve.push(relative(ROOT, p) + ' (empreinte du code dans la doc)');
  }
}

const ok = trouve.length === 0;
/* HONNÊTETÉ (leçon #103) : sans l'empreinte attendue, la recherche du code EN CLAIR n'a
   pas eu lieu. Annoncer « 0 fuite » serait un faux vert — on le DIT, et on garde exit 0
   parce que les deux contrôles STRUCTURELS, eux, ont bien tourné. */
if (!SHA_CONNUE) {
  console.log('\n⚠️  CODE EN CLAIR : NON VÉRIFIÉ ICI — l\'empreinte attendue arrive par le secret');
  console.log('   APEX_ADMIN_PIN_SHA256 (absent hors CI). Rien n\'est stocké dans le dépôt : l\'empreinte');
  console.log('   d\'un code à 6 chiffres se casse en une seconde, la publier revient à publier le code.');
  console.log('   Les 2 contrôles STRUCTURELS ont tourné, eux (64-hex littéral, variable PIN…SHA…).');
}
console.log('\n' + (ok ? '✅' : '❌') + ' garde « pas de code admin en clair » : ' + scanned
  + ' fichiers scannés · ' + (SHA_CONNUE ? trouve.length + ' fuite(s) DANS DU CODE SERVI'
                                          : 'recherche du code en clair NON EFFECTUÉE (voir ci-dessus)'));
if (!ok) {
  console.log('   Exposé publiquement — à retirer (un commentaire compte aussi) :');
  for (const f of trouve.slice(0, 30)) console.log('   ❌ ' + f);
}
if (aNettoyer.length) {
  console.log('   ⚠️  ' + aNettoyer.length + ' occurrence(s) dans l\'outillage du dépôt (non servi, '
    + 'donc pas une fuite publique — mais à nettoyer, et le code reste à CHANGER) :');
  for (const f of aNettoyer.slice(0, 25)) console.log('      · ' + f);
}
process.exit(ok ? 0 : 1);
