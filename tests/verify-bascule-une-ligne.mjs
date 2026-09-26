/* PREUVE — la bascule d'hébergeur tient avec le routeur TEL QU'IL EST EN LIGNE.
 *
 * Historique (le nom du fichier vient de là, gardé pour ne pas casser `test:bascule`) :
 *   16/08 — je fais poser deux variables (UPSTREAM_BASE / UPSTREAM_PREFIX) à Kevin :
 *           le code en ligne ne les lisait NULLE PART. Geste inutile.
 *   17/08 — « change UNE ligne » : vrai seulement selon le rangement du paquet
 *           (dossier CMCteams/ ou racine). Ce test prouvait alors QUELLE ligne.
 *   depuis — le routeur LIT ces deux variables (`env.UPSTREAM_BASE`,
 *           `env.UPSTREAM_PREFIX`, cf. commentaire en tête de worker.js) : la bascule
 *           est devenue un RÉGLAGE dans le tableau de bord Cloudflare, ZÉRO ligne
 *           de code à toucher. Un test qui cherchait encore « la ligne à remplacer »
 *           plantait (« la ligne à remplacer est introuvable »).
 *   10/09 — (m047/m058) la référence git était codée EN DUR sur un distant
 *           `github` et une branche de session : sur tout clone frais (CI comprise)
 *           `git show` sortait en 128 et le test PLANTAIT au lieu d'échouer.
 *
 * Ce que ce test prouve AUJOURD'HUI, sur le code réellement déployé :
 *   1. le routeur en ligne lit bien les deux variables de la consigne ;
 *   2. rangement A (paquet dans un dossier CMCteams/) → UPSTREAM_BASE seule suffit ;
 *   3. rangement B (paquet à la RACINE — le cas réel Cloudflare Pages) → UPSTREAM_BASE
 *      + UPSTREAM_PREFIX vide ; les 8 sous-domaines rendent LEUR page ;
 *   4. discriminants : B sans UPSTREAM_PREFIX ne marche PAS ; une mauvaise adresse
 *      ne marche PAS — sinon le test ne prouverait rien.
 *
 * « En ligne » = ce que déploie `deploy-kdmc-router.yml`, déclenché au push sur main
 * → `origin/main`. Repli honnête si absent (clone superficiel) : `HEAD`, et on le DIT.
 *
 * Lancer : node tests/verify-bascule-une-ligne.mjs
 */
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp, mkdir } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';

const R = { ok: [], ko: [] };
const chk = (c, m) => (c ? R.ok : R.ko).push(m);

/* --- quelle référence git est « en ligne » ? (jamais un nom de distant en dur) -- */
function refEnLigne() {
  for (const r of ['origin/main', 'main', 'HEAD']) {
    try {
      execFileSync('git', ['rev-parse', '--verify', '-q', r + '^{commit}'], { stdio: 'pipe' });
      return r;
    } catch (_) { /* suivant */ }
  }
  return null;
}
const REF = refEnLigne();
if (!REF) { console.log('FAIL aucune référence git lisible (origin/main, main, HEAD)'); process.exit(1); }
console.log(`réf « en ligne » : ${REF}${REF === 'HEAD' ? '  ⚠️ HEAD, pas origin/main : décrit la branche courante, pas la mise en ligne' : ''}`);
const gitShow = (chemin) => execFileSync('git', ['show', `${REF}:${chemin}`], { encoding: 'utf8' });

/* --- les deux rangements possibles du même paquet -------------------------- */
const RANGEMENTS = {
  A: { racine: 'services/kdmc-router/public', quoi: 'dans un dossier CMCteams/', args: ['--leger'],
    env: (pages) => ({ UPSTREAM_BASE: pages }) },
  B: { racine: 'services/kdmc-router/pages-upload', quoi: 'à la RACINE (cas réel Cloudflare Pages)', args: ['--pages', '--leger'],
    env: (pages) => ({ UPSTREAM_BASE: pages, UPSTREAM_PREFIX: '' }) },
};
for (const r of Object.values(RANGEMENTS)) {
  if (!existsSync(r.racine)) {
    execFileSync(process.execPath, ['services/kdmc-router/prepare-secours.mjs', ...r.args], { stdio: 'inherit' });
  }
}

/* --- serveur local qui joue Cloudflare Pages ------------------------------ */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
let RACINE_SERVIE = RANGEMENTS.A.racine;
const serveur = createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = join(RACINE_SERVIE, p);
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!existsSync(f)) { res.writeHead(404); return res.end('introuvable'); }
  res.writeHead(200, { 'content-type': TYPES[extname(f).toLowerCase()] || 'application/octet-stream' });
  res.end(await readFile(f));
});
await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
const PAGES = 'http://127.0.0.1:' + serveur.address().port;

/* --- le routeur EN LIGNE, tel quel (0 modification) ------------------------ */
const deploye = gitShow('services/kdmc-router/worker.js');
chk(deploye.length > 1000, `le code EN LIGNE est lisible (${deploye.length} caractères, réf ${REF})`);
chk(/env\.UPSTREAM_BASE/.test(deploye), 'le routeur en ligne LIT env.UPSTREAM_BASE (la 1re variable de la consigne)');
chk(/env\.UPSTREAM_PREFIX/.test(deploye), 'le routeur en ligne LIT env.UPSTREAM_PREFIX (la 2e variable de la consigne)');
chk(/'cmcteams\.kd-mc\.com': '\/CMCteams'/.test(deploye),
  'le préfixe /CMCteams reste en dur dans ROUTES → un paquet servi à la RACINE exige UPSTREAM_PREFIX vide');

/* Le worker importe ses voisins : on reconstruit la même arborescence dans un
   dossier temporaire, depuis la MÊME référence git (pas le disque de travail). */
const dossier = await mkdtemp(join(tmpdir(), 'routeur-'));
await mkdir(join(dossier, 'kdmc-router'), { recursive: true });
await mkdir(join(dossier, '_shared'), { recursive: true });
await writeFile(join(dossier, 'kdmc-router', 'worker.js'), deploye);
for (const m of ['webauthn.js', 'fb-token.js']) {
  await writeFile(join(dossier, 'kdmc-router', m), gitShow(`services/kdmc-router/${m}`));
}
await writeFile(join(dossier, '_shared', 'ia-route.js'), gitShow('services/_shared/ia-route.js'));
const routeur = (await import('file://' + join(dossier, 'kdmc-router', 'worker.js'))).default;
chk(typeof routeur?.fetch === 'function', 'le routeur en ligne s\'importe tel quel (export default { fetch })');

/* --- chaque sous-domaine rend-il SA page ? -------------------------------- */
const SOUS = [
  ['kd-mc.com', 'KDMC'],
  ['cmcteams.kd-mc.com', 'CMC'],
  ['departs.kd-mc.com', 'CMCteams light'],
  ['studio.kd-mc.com', ''],
  ['lingua.kd-mc.com', ''],
  ['coffre.kd-mc.com', ''],
  ['apex-ai.kd-mc.com', ''],
  ['apex-chat.kd-mc.com', ''],
];
async function essai(env, hote) {
  try {
    const rep = await routeur.fetch(new Request('https://' + hote + '/'), env);
    const txt = await rep.text();
    return { statut: rep.status, taille: txt.length, txt };
  } catch (e) { return { statut: 0, taille: 0, txt: 'ERREUR ' + e.message }; }
}

for (const cle of ['A', 'B']) {
  const rg = RANGEMENTS[cle];
  RACINE_SERVIE = rg.racine;
  const env = rg.env(PAGES);
  console.log(`\n■ Rangement ${cle} — paquet ${rg.quoi} → variables : ${JSON.stringify(env)} (0 ligne de code)`);
  console.log('  sous-domaine              HTTP   taille   contenu attendu');
  console.log('  ──────────────────────────────────────────────────────────');
  for (const [hote, attendu] of SOUS) {
    const r = await essai(env, hote);
    const verdict = attendu ? (r.txt.includes(attendu) ? '✅ « ' + attendu + ' »' : '❌ « ' + attendu + ' » absent') : '—';
    console.log(`  ${hote.padEnd(24)} ${String(r.statut).padStart(4)}  ${String(r.taille).padStart(7)}  ${verdict}`);
    chk(r.statut === 200, `[${cle}] ${hote} → 200 après la bascule (reçu ${r.statut})`);
    chk(r.taille > 500, `[${cle}] ${hote} → vraie page (${r.taille} caractères)`);
    if (attendu) chk(r.txt.includes(attendu), `[${cle}] ${hote} → c'est bien SA page (« ${attendu} » présent)`);
  }
}

/* --- DISCRIMINANT 1 : à la RACINE, UPSTREAM_BASE seule ne suffit PAS -------- */
RACINE_SERVIE = RANGEMENTS.B.racine;
const rSansPrefixe = await essai(RANGEMENTS.A.env(PAGES), 'kd-mc.com');
chk(rSansPrefixe.statut !== 200,
  `DISCRIMINANT : paquet à la RACINE + UPSTREAM_BASE seule (préfixe /CMCteams conservé) → ne marche PAS (${rSansPrefixe.statut}) — c'est pourquoi UPSTREAM_PREFIX vide fait partie de la consigne`);

/* --- DISCRIMINANT 2 : une mauvaise adresse ne marche PAS -------------------- */
const rRien = await essai({ UPSTREAM_BASE: 'http://127.0.0.1:1', UPSTREAM_PREFIX: '' }, 'kd-mc.com');
chk(rRien.statut !== 200, `DISCRIMINANT : sans la bonne adresse, kd-mc.com ne marche PAS (${rRien.statut || 'erreur'})`);

/* --- DISCRIMINANT 3 : la valeur est nettoyée (espace, barre finale) --------- */
RACINE_SERVIE = RANGEMENTS.B.racine;
const rSale = await essai({ UPSTREAM_BASE: ' ' + PAGES + '/ ', UPSTREAM_PREFIX: ' / ' }, 'kd-mc.com');
chk(rSale.statut === 200, `une valeur tapée avec un espace ou une barre finale marche quand même (${rSale.statut}) — Kevin les pose sur iPhone`);

serveur.close();
console.log();
R.ko.forEach((m) => console.log('  FAIL ' + m));
console.log(`\n=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
process.exit(R.ko.length ? 1 : 0);
