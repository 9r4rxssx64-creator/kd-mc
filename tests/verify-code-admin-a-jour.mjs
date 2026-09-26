/* GARDE — « un service qui décroche du code admin doit CRIER » (Kevin 2026-09-22 :
 * « Fais bien le nettoyage partout. Mets tout à jour dans rien oublier »).
 *
 * LE PROBLÈME, MESURÉ EN VRAI LE 22.09.2026
 * -----------------------------------------
 * Kevin change son code admin : il met à jour UN secret sur GitHub. Mais chaque service
 * du domaine en garde une COPIE, posée le jour de son dernier déploiement. Tant qu'un
 * service n'est pas redéployé, il continue d'accepter l'ANCIEN code — et rien, nulle
 * part, ne le dit. Mesuré ce jour-là : 3 services en retard, dont la mémoire d'Apex
 * restée au 8 juillet, soit plus de deux mois après la rotation.
 *
 * DEUXIÈME TROU, PIRE ENCORE
 * --------------------------
 * `wrangler secret put … | tail -2` : le code de sortie d'un TUYAU est celui de la
 * DERNIÈRE commande — `tail`, qui réussit toujours. Donc un « pose du code admin »
 * RATÉ ressortait VERT, et le `|| echo "::warning::…"` derrière ne se déclenchait
 * même jamais. C'est le même piège que `| tee`, déjà attrapé par
 * tests/workflows-pipefail.test.mjs — mais celui-là ne regardait QUE `tee`.
 *
 * CE QUE CETTE GARDE VÉRIFIE
 * --------------------------
 *   HORS LIGNE (mord toujours, dans test:ci)
 *     1. tout workflow qui pose un code admin est DÉCLARÉ dans le registre ;
 *     2. tout service déclaré a bien son workflow ;
 *     3. chacun est lançable à la main (workflow_dispatch) → je peux redéployer seul ;
 *     4. la pose du code admin ne peut PAS échouer en silence (ni tuyau, ni `|| echo`) ;
 *     5. chaque service dit POURQUOI il compte, en français, en une phrase.
 *   EN LIGNE (seulement quand le réseau et un jeton GitHub sont là)
 *     6. aucun service n'est resté loin derrière les autres.
 *   Sans réseau, le point 6 est annoncé « NON VÉRIFIÉ ICI » — jamais un faux vert
 *   (leçon #103).
 *
 * Le code admin lui-même n'apparaît NULLE PART ici : on ne manipule que des NOMS de
 * secrets et des DATES.
 *
 * node tests/verify-code-admin-a-jour.mjs
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, '.github/workflows');
const REGISTRE = join(ROOT, 'tools/audit/services-code-admin.json');

/* Un service qui n'a pas été redéployé depuis plus longtemps que ça alors que ses
   voisins l'ont été est considéré comme DÉCROCHÉ. 60 jours = large exprès : on veut
   attraper « resté au 8 juillet », pas faire rougir un service tranquille. */
const RETARD_MAX_JOURS = 60;

let pass = 0;
const fails = [];
const notes = [];
const ok = (m) => { pass++; console.log('  ✅ ' + m); };
const ko = (m) => { fails.push(m); console.log('  ❌ ' + m); };

console.log('\n=== LE CODE ADMIN EST-IL À JOUR PARTOUT ? ===\n');

/* ---------- le registre ---------- */
if (!existsSync(REGISTRE)) {
  console.log('❌ registre introuvable : tools/audit/services-code-admin.json');
  process.exit(1);
}
const reg = JSON.parse(readFileSync(REGISTRE, 'utf8'));
const SECRET = reg.secret_github;
const services = reg.services || [];

/* ---------- 1+2. registre ⇄ workflows : personne ne manque des deux côtés ---------- */
const POSE = /wrangler\s+secret\s+put\s+"?([A-Z0-9_]*ADMIN_PIN_SHA[A-Z0-9_]*)"?/;
const trouves = [];
for (const f of readdirSync(DIR).filter((n) => /\.ya?ml$/.test(n))) {
  const txt = readFileSync(join(DIR, f), 'utf8');
  if (POSE.test(txt) || new RegExp('push_if_set\\s+' + SECRET + '\\b').test(txt)) trouves.push(f);
}
const declares = new Set(services.map((s) => s.workflow));
const oublies = trouves.filter((f) => !declares.has(f));
if (oublies.length) ko('workflow(s) qui posent un code admin SANS être au registre : ' + oublies.join(', '));
else ok(trouves.length + ' workflow(s) qui posent un code admin, tous déclarés au registre');

const fantomes = services.filter((s) => !existsSync(join(DIR, s.workflow)));
if (fantomes.length) ko('service(s) déclarés dont le workflow n\'existe plus : ' + fantomes.map((s) => s.id).join(', '));
else ok(services.length + ' service(s) déclarés, tous avec leur workflow');

/* ---------- 3+4+5. chaque service, un par un ---------- */
const etapePose = new Map();
for (const s of services) {
  const chemin = join(DIR, s.workflow);
  if (!existsSync(chemin)) continue;
  const txt = readFileSync(chemin, 'utf8');

  /* 3. lançable à la main : sinon je ne peux pas le redéployer sans Kevin */
  if (!/^\s*workflow_dispatch:/m.test(txt)) ko(s.id + ' : pas lançable à la main (workflow_dispatch absent) → impossible à redéployer sans Kevin');
  else ok(s.id + ' : lançable à la main');

  /* 4. la pose ne peut pas échouer en silence */
  const etapes = txt.split(/(?=\n\s*- name:)/);
  const concernees = etapes.filter((e) =>
    new RegExp('secret\\s+put\\s+"?' + s.secret_pose + '\\b').test(e) ||
    new RegExp('push_if_set\\s+' + SECRET + '\\b').test(e));
  if (!concernees.length) {
    ko(s.id + ' : aucune étape ne pose « ' + s.secret_pose + ' » — le registre ment ou le workflow a changé');
    continue;
  }
  /* le NOM EXACT de l'étape qui pose : il servira au contrôle en ligne, pour
     mesurer « le code a-t-il été POSÉ ? » et non « le déploiement a-t-il réussi ? ». */
  const nomEtape = (concernees[0].match(/-\s*name:\s*(.+)/) || [, ''])[1].trim();
  if (nomEtape) etapePose.set(s.id, nomEtape);

  let muet = null;
  for (const e of concernees) {
    const protege = /^\s*shell:.*pipefail/m.test(e);
    for (const ligne of e.split('\n')) {
      if (!/wrangler\s+secret\s+put/.test(ligne)) continue;
      if (/\|\s*(tail|head|tee|cat)\b/.test(ligne) && !protege) { muet = 'tuyau sans pipefail → le code de sortie est celui de `tail`, toujours 0'; break; }
      if (/\|\|\s*(true|:|echo)/.test(ligne)) { muet = 'échec avalé par `|| ' + (ligne.match(/\|\|\s*(\w+|:)/) || [, '…'])[1] + '`'; break; }
    }
    if (muet) break;
  }
  if (muet) ko(s.id + ' : la pose du code admin peut ÉCHOUER EN SILENCE (' + muet + ') → le service garderait l\'ancien code, au vert');
  else ok(s.id + ' : une pose ratée du code admin fait ROUGIR le déploiement');

  /* 4bis. jamais un code admin VIDE : un secret absent doit ARRÊTER le déploiement,
     sinon on remplace l'ancien code par rien du tout — pire que de ne rien faire.
     Mesuré le 22.09 : monaco et outlook n'avaient aucune vérification de présence. */
  const VIDE = /-z\s+"\$\{?\{?\s*secrets\.APEX_ADMIN_PIN_SHA256|-z\s+"\$(PINSHA|APEX_ADMIN_PIN_SHA256|ADMIN_PIN_SHA256)|-n\s+"\$\{ADMIN_PIN_SHA256/;
  if (!VIDE.test(txt)) ko(s.id + ' : rien ne vérifie que le code admin est PRÉSENT → un secret absent poserait un code VIDE sur le service');
  else ok(s.id + ' : refuse de poser un code admin vide');

  /* 5. dire pourquoi ce service compte, en français lisible */
  if (!s.pourquoi || s.pourquoi.trim().length < 30) ko(s.id + ' : « pourquoi » absent ou trop court — Kevin doit pouvoir lire ce qu\'il risque');
  else ok(s.id + ' : « pourquoi » écrit (' + s.pourquoi.trim().length + ' caractères)');

  /* cas dérivé : la clé est FABRIQUÉE à partir du code, elle doit vraiment l'être */
  if (s.derive && !new RegExp(SECRET).test(txt)) ko(s.id + ' : déclaré « dérivé du code admin » mais ' + SECRET + ' n\'apparaît pas dans son workflow');
  else if (s.derive) ok(s.id + ' : sa clé est bien fabriquée à partir du code admin');
}

/* ---------- 6. en ligne : qui est resté en arrière ? ----------
   ⚠️ 22.09.2026 — ce contrôle mesurait la DATE DU DERNIER DÉPLOIEMENT RÉUSSI. C'est
   un raccourci FAUX dans les deux sens :
     • un déploiement peut échouer pour une raison qui n'a RIEN à voir avec le code
       admin (kdmc-rag : un droit Cloudflare manquant sur l'index Vectorize) alors que
       l'étape qui pose le code, elle, a parfaitement abouti → la garde criait « il
       garde l'ancien code » alors que le code venait d'être posé, et ce rouge
       revenait sur CHAQUE demande de fusion. Une garde toujours rouge, plus personne
       ne la lit (c'est la leçon #103 à l'envers : le faux ROUGE use autant que le
       faux vert) ;
     • à l'inverse, un déploiement peut réussir alors que la pose, elle, a été sautée.
   On mesure donc la BONNE chose : la dernière fois que l'ÉTAPE qui pose le code admin
   a réellement abouti. GitHub donne la conclusion de chaque étape de chaque exécution.
   Si cette étape est introuvable (workflow renommé depuis, exécutions trop anciennes),
   on retombe sur l'ancienne mesure et on le DIT. */
const DEPOT = process.env.GITHUB_REPOSITORY || '9r4rxssx64-creator/CMCteams';
const JETON = process.env.GITHUB_TOKEN || process.env.APEX_GITHUB_PAT || process.env.GH_TOKEN || '';

const api = async (chemin) => {
  const r = await fetch('https://api.github.com/repos/' + DEPOT + chemin, {
    headers: { authorization: 'Bearer ' + JETON, accept: 'application/vnd.github+json', 'user-agent': 'cmcteams-garde' },
  });
  return r.ok ? r.json() : null;
};

/* La dernière fois que l'ÉTAPE qui pose le code admin a abouti — quelle qu'ait été
   l'issue du déploiement autour d'elle. */
async function dernierePose(fichier, nomEtape) {
  if (!nomEtape) return null;
  const liste = await api('/actions/workflows/' + fichier + '/runs?per_page=10');
  for (const run of (liste && liste.workflow_runs) || []) {
    if (!run.conclusion) continue;               // encore en cours
    const jobs = await api('/actions/runs/' + run.id + '/jobs?per_page=30');
    for (const job of (jobs && jobs.jobs) || []) {
      for (const etape of job.steps || []) {
        if ((etape.name || '').trim() !== nomEtape) continue;
        if (etape.conclusion === 'success') {
          return { d: new Date(etape.completed_at || run.updated_at), via: 'etape', run: run.id };
        }
      }
    }
  }
  return null;
}

/* Repli : la date du dernier déploiement entièrement réussi (mesure moins précise). */
async function dernierSucces(fichier) {
  const j = await api('/actions/workflows/' + fichier + '/runs?status=success&per_page=1');
  const run = j && (j.workflow_runs || [])[0];
  return run ? { d: new Date(run.updated_at), via: 'deploiement', run: run.id } : null;
}

if (!JETON) {
  notes.push('les DATES de pose du code admin ne sont PAS vérifiées ici (aucun jeton GitHub hors CI) — ce contrôle tourne dans la chaîne en ligne');
  console.log('  ⚠️  dates de pose du code admin : NON VÉRIFIÉ ICI (pas de jeton GitHub) — jamais un faux vert');
} else {
  const dates = [];
  for (const s of services) {
    let x = null;
    try { x = await dernierePose(s.workflow, etapePose.get(s.id)); } catch (_) { x = null; }
    if (!x) { try { x = await dernierSucces(s.workflow); } catch (_) { x = null; } }
    dates.push({ s, x });
  }
  const connues = dates.filter((e) => e.x);
  if (connues.length < 2) {
    notes.push('dates illisibles (API GitHub muette) — contrôle non effectué');
    console.log('  ⚠️  dates de pose : l\'API GitHub n\'a rien rendu — NON VÉRIFIÉ');
  } else {
    const recent = Math.max(...connues.map((e) => e.x.d.getTime()));
    const seuil = reg.secret_change_le ? new Date(reg.secret_change_le).getTime() : null;
    let retards = 0;
    for (const { s, x } of dates) {
      if (!x) { console.log('  ⚠️  ' + s.id + ' : aucune pose ni aucun déploiement réussi trouvé'); continue; }
      const jours = Math.round((recent - x.d.getTime()) / 86400000);
      const quoi = x.via === 'etape' ? 'code admin posé' : 'déploiement réussi (pose non mesurable)';
      const enRetard = seuil ? x.d.getTime() < seuil : jours > RETARD_MAX_JOURS;
      if (enRetard) { retards++; ko(s.id + ' (' + s.nom + ') : ' + quoi + ' le ' + x.d.toISOString().slice(0, 10) + ', soit ' + jours + ' jours derrière les autres → il garde probablement un ANCIEN code admin. ' + s.pourquoi); }
      else console.log('  ✅ ' + s.id + ' : ' + quoi + ' le ' + x.d.toISOString().slice(0, 10) + ' (' + jours + ' j derrière le plus récent)');
    }
    if (!retards) ok('aucun service n\'a décroché : le code admin a été posé partout dans la même fenêtre');
  }
}

console.log('');
if (notes.length) notes.forEach((n) => console.log('  ⚠️  ' + n));
if (fails.length) {
  console.log('\n❌ CODE ADMIN : ' + fails.length + ' problème(s) — ' + pass + ' contrôle(s) OK');
  console.log('   Un service en retard accepte encore l\'ANCIEN code. Relancer son déploiement :');
  console.log('   Actions → le workflow du service → « Run workflow ».');
  process.exit(1);
}
console.log('✅ CODE ADMIN : ' + pass + ' contrôle(s) OK, 0 échec');
process.exit(0);
