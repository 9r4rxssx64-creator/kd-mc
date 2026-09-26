/* COMBIEN NOUS COÛTE GITHUB CE MOIS-CI ? — mesure, pas supposition
 *
 * Kevin, 22.09.2026 : « que ça ne me coûte pas plus cher qu'avant, c'est-à-dire rien ».
 *
 * POURQUOI CET OUTIL EXISTE
 * -------------------------
 * Tant que le dépôt était PUBLIC, GitHub offrait les exécutions sans limite : elles
 * étaient facturées 0. Depuis qu'il est PRIVÉ (22.09), elles se prennent sur un
 * forfait gratuit de 2000 minutes par mois. Le risque est donc nouveau — et il est
 * invisible tant que personne ne le mesure.
 *
 * Cet outil additionne les minutes RÉELLEMENT FACTURÉES que GitHub déclare pour
 * chaque exécution (`/actions/runs/<id>/timing`), mois en cours. Il n'invente rien :
 * si GitHub dit 0, il dit 0.
 *
 * Lance :  node tools/audit/cout-actions.mjs          (jeton : GITHUB_TOKEN)
 *          node tools/audit/cout-actions.mjs --jours 7
 */
const DEPOT = process.env.KDMC_DEPOT || '9r4rxssx64-creator/CMCteams';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const FORFAIT_GRATUIT = 2000;                       // minutes/mois, compte personnel Free
const args = process.argv.slice(2);
const jours = Number((args[args.indexOf('--jours') + 1] || 0)) || 0;

if (!TOKEN) {
  console.log('⚠️  Pas de jeton GitHub (GITHUB_TOKEN) — NON VÉRIFIÉ ICI.');
  console.log('   Cet outil ne devine pas : sans jeton il ne dit rien plutôt que de dire faux.');
  process.exit(0);
}

async function api(chemin) {
  const r = await fetch('https://api.github.com' + chemin, {
    headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json' },
  });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' sur ' + chemin);
  return r.json();
}

const maintenant = new Date();
const depuis = jours
  ? new Date(maintenant.getTime() - jours * 86400000)
  : new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), 1));

console.log(`\n=== MINUTES GITHUB FACTURÉES — ${DEPOT} ===`);
console.log(`Période : depuis ${depuis.toISOString().slice(0, 10)}\n`);

const runs = [];
/* ⚠️ HONNÊTETÉ (le piège dans lequel cet outil est tombé à sa 1re exécution) :
   quand l'appel à GitHub échoue, on ne mesure RIEN — et « rien mesuré » ne doit
   JAMAIS s'afficher comme « 0 minute facturée », sinon l'outil rassure à tort.
   On retient donc l'échec et on le DIT. */
let panne = '';
for (let page = 1; page <= 20; page++) {
  let d;
  try { d = await api(`/repos/${DEPOT}/actions/runs?per_page=100&page=${page}`); }
  catch (e) { if (page === 1) panne = e.message; else console.log('  (arrêt page ' + page + ' : ' + e.message + ')'); break; }
  const lot = d.workflow_runs || [];
  if (!lot.length) break;
  let fini = false;
  for (const r of lot) {
    if (new Date(r.created_at) < depuis) { fini = true; break; }
    if ((r.conclusion || '') === 'skipped') continue;   // sauté = 0 minute
    runs.push(r);
  }
  if (fini) break;
}

let total = 0;         // ce que GITHUB DÉCLARE facturé
let totalReel = 0;     // ce qu'on MESURE nous-mêmes (temps de machine réellement passé)
const parWf = new Map();
const parWfReel = new Map();
for (const r of runs) {
  let t;
  try { t = await api(`/repos/${DEPOT}/actions/runs/${r.id}/timing`); } catch { continue; }
  let m = 0;
  for (const v of Object.values(t.billable || {})) m += (v.total_ms || 0) / 60000;
  /* ⚠️ MESURÉ LE 22.09 : GitHub a déclaré « 0 minute facturée » sur une exécution
     qui avait réellement tourné 6,2 MINUTES. Le champ `billable` ne suffit donc
     pas — s'y fier seul, c'est promettre « ça ne coûte rien » sans le savoir
     (exactement le faux vert qu'on a déjà payé aujourd'hui).
     On mesure donc AUSSI le temps réel : c'est lui qui se prend sur le forfait. */
  const reel = (t.run_duration_ms || 0) / 60000;
  total += m; totalReel += reel;
  parWf.set(r.name, (parWf.get(r.name) || 0) + m);
  parWfReel.set(r.name, (parWfReel.get(r.name) || 0) + reel);
}

if (panne) {
  console.log('  ⚠️  NON VÉRIFIÉ ICI — GitHub a refusé la lecture : ' + panne);
  console.log('     (Depuis l’agent, le jeton n’est pas transmis par le proxy ; cet outil');
  console.log('      est fait pour tourner dans la CI, où le jeton est réel.)');
  console.log('\n  Le solde exact se voit ici : https://github.com/settings/billing\n');
  process.exit(0);
}
console.log(`  ${runs.length} exécution(s) réelle(s) mesurée(s)`);
console.log(`  GitHub déclare facturé : ${total.toFixed(0)} minute(s)`);
console.log(`  temps machine RÉELLEMENT passé : ${totalReel.toFixed(0)} minute(s)`);
console.log(`  forfait gratuit d'un dépôt privé : ${FORFAIT_GRATUIT} min/mois`);

if (total === 0 && totalReel > 5) {
  /* Le cas vécu : GitHub dit 0, mais les machines ont bien tourné. On ne dit
     donc NI « c'est gratuit » NI « c'est facturé » — on dit ce qu'on sait. */
  const pct = Math.round((totalReel / FORFAIT_GRATUIT) * 100);
  console.log('\n  ⚠️  GitHub annonce 0 minute facturée, alors que les machines ont');
  console.log(`     réellement tourné ${totalReel.toFixed(0)} minutes. Son compteur n'est donc pas à jour`);
  console.log('     (ou le compte ne reporte pas ici). NE PAS en conclure « c\'est gratuit ».');
  console.log(`\n  Ce qui est SÛR : ${pct}% du forfait gratuit en temps machine réel.`);
} else if (total === 0) {
  console.log('\n  ✅ 0 minute : aucune machine n\'a tourné sur la période.');
} else {
  const pct = Math.round((total / FORFAIT_GRATUIT) * 100);
  console.log(`\n  ${pct}% du forfait gratuit consommé (déclaré par GitHub).`);
  if (pct >= 80) console.log('\n  ⚠️  On approche du forfait — au-delà, GitHub facture à la minute.');
}
{
  const top = [...parWfReel.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (top.length) {
    console.log('\n  Les plus gourmands (temps machine réel) :');
    for (const [nom, m] of top) console.log(`    ${m.toFixed(0).padStart(5)} min · ${nom}`);
  }
}
console.log('\n  Le solde exact du compte se voit ici : https://github.com/settings/billing\n');
