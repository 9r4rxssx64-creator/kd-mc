#!/usr/bin/env node
/* ============================================================================
 * SONDE — « l'hébergeur publie-t-il PLUS que les applications ? »
 * ----------------------------------------------------------------------------
 * Kevin 2026-09-15 : « passe tout en privé, que personne ne puisse voir mon
 * code, mes liens, tout ce qui se construit. Seulement les sites restent
 * accessibles. »
 *
 * MESURÉ le 18.09.2026, et c'est la raison d'être de ce fichier : après la
 * bascule du domaine vers Cloudflare Pages, `cmcteams.kd-mc.com/package.json`
 * répondait encore 200 — puis l'hébergeur lui-même, interrogé directement,
 * répondait 200 lui aussi. Le paquet envoyé par `prepare-secours.mjs --pages`
 * NE CONTIENT PAS package.json : donc ce que sert l'hébergeur n'est pas (ou
 * pas seulement) ce paquet.
 *
 * Conséquence si on ne regarde pas : le dépôt passe en privé, tout le monde est
 * content… et l'hébergeur continue de servir publiquement le contenu du dépôt,
 * plannings compris. « Privé » sur GitHub ne rend pas privé ce qu'un AUTRE
 * hébergeur publie déjà.
 *
 * Cette sonde ouvre RÉELLEMENT une liste de chemins qui ne doivent JAMAIS être
 * servis, et échoue si l'un d'eux répond. Elle ne suppose rien : elle mesure.
 *
 * Usage :
 *   node tools/audit/sonde-fuite-hebergeur.mjs https://kdmc-site-bj5.pages.dev
 *   node tools/audit/sonde-fuite-hebergeur.mjs https://cmcteams.kd-mc.com
 * ========================================================================== */

const base = (process.argv[2] || '').replace(/\/+$/, '');
if (!base) {
  console.error('Usage : node tools/audit/sonde-fuite-hebergeur.mjs <adresse>');
  process.exit(2);
}

/* Ce qui ne doit JAMAIS sortir d'un site public. Chaque entrée dit POURQUOI —
   sans la raison, personne ne saura dans six mois s'il peut la retirer. */
const INTERDITS = [
  ['package.json', 'la fabrication du dépôt (dépendances, liste des gardes)'],
  ['CLAUDE.md', 'les règles de travail de Kevin'],
  ['LESSONS.md', 'le journal des erreurs et des correctifs'],
  ['MEMO_RESUME.md', "l'état de travail en cours"],
  ['NOTES_USER.md', 'les informations métier (équipes, codes, personnes)'],
  ['pipeline/sessions.json', 'les échanges entre sessions de travail'],
  ['tests/fixtures/septembre-2026-v2.pdf', 'UN PLANNING SBM D’ORIGINE (noms du personnel)'],
  ['tests/fixtures/octobre-2026.pdf', 'UN PLANNING SBM D’ORIGINE (noms du personnel)'],
  ['tests/fixtures/octobre-2026-v2.pdf', 'UN PLANNING SBM D’ORIGINE (noms du personnel)'],
  ['services/kdmc-router/worker.js', 'le code serveur du domaine'],
  ['.github/workflows/deploy.yml', 'les automatisations (noms des secrets)'],
  ['audit/00-INVENTAIRE.md', "les rapports d'audit internes"],
  /* R3 étape B (1.10.2026, leçon #376) : les données RH nominatives (291 noms + plannings) ne sortent QUE par le
     routeur, derrière la connexion (401 + x-kdmc-porte sinon). L'hébergeur (pages.dev) ne doit plus les porter. */
  ['tools/departs/boards-gen.js', 'DONNÉES RH : 291 noms + plannings (servies seulement derrière la connexion)'],
  ['tools/shared/planning-seed.js', 'DONNÉES RH : le planning nominatif (servi seulement derrière la connexion)'],
  ['tools/shared/seances-seed.js', 'DONNÉES RH : les séances nominatives (servies seulement derrière la connexion)'],
  ['tools/departs/seances-gen.js', 'DONNÉES RH : copie des séances pour la light (servie seulement derrière la connexion)'],
];

const TEMPS = 20000;
async function sonder([chemin, pourquoi]) {
  const url = `${base}/${chemin}`;
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      headers: { 'cache-control': 'no-cache', 'user-agent': 'kdmc-sonde-fuite/1' },
      signal: AbortSignal.timeout(TEMPS),
    });
    /* Un 200 qui rend la page d'accueil (repli SPA) n'est PAS une fuite : on
       exige que le contenu ressemble vraiment au fichier demandé. */
    const texte = await r.text();
    const estPage = /<(!doctype|html)\b/i.test(texte.slice(0, 400));
    const fuite = r.status === 200 && !estPage;
    return { chemin, pourquoi, http: r.status, octets: texte.length, fuite, estPage };
  } catch (e) {
    return { chemin, pourquoi, http: 0, octets: 0, fuite: false, erreur: String(e.message).slice(0, 50) };
  }
}

console.log(`Sonde « ce qui ne doit pas sortir » sur ${base}\n`);
const res = [];
for (let i = 0; i < INTERDITS.length; i += 4) {
  res.push(...await Promise.all(INTERDITS.slice(i, i + 4).map(sonder)));
}

console.log('chemin                                       HTTP   résultat');
console.log('──────────────────────────────────────────────────────────────');
for (const r of res) {
  const etat = r.fuite ? `❌ SERVI (${r.octets} car.) — ${r.pourquoi}`
    : r.estPage ? '✅ non servi (page d\'accueil en repli)'
      : r.erreur ? `✅ non servi (${r.erreur})` : '✅ non servi';
  console.log(`${r.chemin.padEnd(44)} ${String(r.http).padEnd(6)} ${etat}`);
}

/* Ne JAMAIS rassurer sans avoir mesuré : si tout a échoué au réseau, on n'a
   rien prouvé du tout — c'est un « faux vert », pas un résultat. */
if (res.every((r) => r.http === 0)) {
  console.error('\n❌ MESURE IMPOSSIBLE : aucune réponse de cet hébergeur. Je ne conclus rien.');
  process.exit(2);
}

const fuites = res.filter((r) => r.fuite);
console.log(`\n=== ${fuites.length} fuite(s) sur ${res.length} chemins testés ===`);
if (fuites.length) {
  console.log('\nCe site publie des fichiers qui ne sont pas des applications.');
  console.log('Passer le dépôt en privé NE fermera PAS cette porte : c\'est un autre hébergeur.');
  process.exit(1);
}
console.log('Cet hébergeur ne sert que les applications. ✅');
