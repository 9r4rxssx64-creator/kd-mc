#!/usr/bin/env node
/* ============================================================================
 * COMBIEN DE MINUTES GITLAB A-T-ON CONSOMMÉES CE MOIS-CI ?
 * ----------------------------------------------------------------------------
 * Kevin, 5.09.2026 : « pour ne plus faire d'erreur ».
 *
 * L'erreur à ne PAS refaire, c'est de déplacer sur GitLab tout ce que GitHub
 * interdit… et d'y reproduire exactement le même problème. GitLab est clair :
 *
 *     « Free tier namespaces receive 400 compute minutes per month. »
 *     « Reduce the frequency of scheduled pipelines. »   (leur propre conseil)
 *
 * 400 minutes, ce n'est pas beaucoup : la publication du site en consomme déjà
 * une trentaine sur 100 jobs. Ce script compte ce qu'on a réellement dépensé,
 * par job, pour qu'on décide sur des chiffres et pas au ressenti.
 *
 * Lancer :  GITLAB_TOKEN=… node tools/audit/minutes-gitlab.mjs
 *           (le jeton n'est jamais écrit sur le disque — garde
 *            test:secret-jamais-persiste)
 * ========================================================================== */

const PROJET = 85753352;                 // kdmc-group/Kdmc-project
const QUOTA = 400;                       // minutes/mois, palier gratuit GitLab
const JETON = process.env.GITLAB_TOKEN || '';

if (!JETON) {
  console.log('Il manque le jeton GitLab.');
  console.log('  GITLAB_TOKEN=… node tools/audit/minutes-gitlab.mjs');
  console.log('\nRappel du cadre (lu le 5.09 dans la doc GitLab) :');
  console.log('  · palier gratuit = 400 minutes de calcul par mois');
  console.log('  · GitLab conseille lui-même de réduire la fréquence des pipelines programmés');
  process.exit(0);
}

const api = async (chemin) => {
  const r = await fetch(`https://gitlab.com/api/v4/projects/${PROJET}${chemin}`,
    { headers: { 'PRIVATE-TOKEN': JETON } });
  if (!r.ok) throw new Error(`HTTP ${r.status} sur ${chemin}`);
  return r.json();
};

const debutDuMois = new Date();
debutDuMois.setDate(1); debutDuMois.setHours(0, 0, 0, 0);

let jobs = [];
for (let page = 1; page <= 10; page++) {
  const lot = await api(`/jobs?per_page=100&page=${page}`);
  if (!lot.length) break;
  jobs = jobs.concat(lot);
  const dernier = lot[lot.length - 1];
  if (dernier.created_at && new Date(dernier.created_at) < debutDuMois) break;
}

const duMois = jobs.filter((j) => j.created_at && new Date(j.created_at) >= debutDuMois);
const secondes = (j) => j.duration || 0;
const total = duMois.reduce((s, j) => s + secondes(j), 0) / 60;

const parNom = new Map();
for (const j of duMois) parNom.set(j.name, (parNom.get(j.name) || 0) + secondes(j) / 60);
const classe = [...parNom.entries()].sort((a, b) => b[1] - a[1]);

const pct = Math.round((total / QUOTA) * 100);
const feu = pct >= 90 ? '🔴' : pct >= 70 ? '🟠' : '🟢';

console.log(`Minutes GitLab — mois en cours (depuis le ${debutDuMois.toLocaleDateString('fr-FR')})\n`);
console.log(`  ${feu}  ${total.toFixed(1)} min consommées sur ${QUOTA}  (${pct} %)`);
console.log(`      ${duMois.length} jobs · il reste ${(QUOTA - total).toFixed(0)} min\n`);
console.log('  Ce qui consomme :');
for (const [nom, min] of classe.slice(0, 12)) {
  const part = Math.round((min / total) * 100) || 0;
  console.log(`    ${min.toFixed(1).padStart(6)} min  ${String(part).padStart(3)} %  ${nom}`);
}

/* Ce qu'on peut encore se permettre — la question qu'on se pose vraiment
   avant d'ajouter un job périodique. */
const restant = QUOTA - total;
const joursRestants = Math.max(1, new Date(debutDuMois.getFullYear(), debutDuMois.getMonth() + 1, 0).getDate() - new Date().getDate());
console.log(`\n  Marge : ${restant.toFixed(0)} min pour ${joursRestants} jour(s) = ${(restant / joursRestants).toFixed(1)} min/jour.`);
console.log(`  Un job quotidien de 2 min coûte ~60 min/mois, soit ${Math.round((60 / QUOTA) * 100)} % du quota.`);
if (pct >= 70) console.log('\n  ⚠️ Au-delà de 70 %, ne plus ajouter de job périodique sans en retirer un.');

process.exit(pct >= 100 ? 1 : 0);
