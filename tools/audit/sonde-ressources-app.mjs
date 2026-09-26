#!/usr/bin/env node
/* ============================================================================
 * SONDE — « l'app charge-t-elle VRAIMENT ses données de planning ? »
 * ----------------------------------------------------------------------------
 * Pourquoi cette sonde existe (mesuré le 19.09.2026) :
 *
 * La page CMCteams ne contient PAS le planning : elle le charge dans trois
 * fichiers à part, écrits en adresse ABSOLUE — « /CMCteams/tools/shared/
 * planning-seed.js ». Cette forme vient de l'ancien hébergeur, où le site
 * vivait dans un dossier /CMCteams. Le nouvel hébergeur sert à la RACINE :
 * c'est le routeur qui retire le préfixe au passage.
 *
 * Si ce retrait casse un jour, il ne casse PAS bruyamment : l'hébergeur ne
 * trouve pas le fichier et renvoie… la page d'accueil, avec un code 200
 * (leçon #285, le piège du repli). Le navigateur reçoit donc du HTML là où il
 * attend du JavaScript : le planning est VIDE, et la page a l'air d'aller bien.
 *
 * Une sonde qui ne regarde que la page d'accueil ne voit RIEN de tout ça.
 * Celle-ci ouvre les fichiers eux-mêmes et exige du vrai JavaScript.
 *
 * Usage : node tools/audit/sonde-ressources-app.mjs
 * ========================================================================== */

const CIBLES = [
  { url: 'https://cmcteams.kd-mc.com/CMCteams/tools/shared/planning-seed.js', attendu: /CMC_PLANNING_SEED|parser/, quoi: 'plannings de l\'app' },
  { url: 'https://cmcteams.kd-mc.com/CMCteams/tools/departs/boards-gen.js', attendu: /DEPARTS_GEN/, quoi: 'départs de l\'app' },
  { url: 'https://cmcteams.kd-mc.com/CMCteams/tools/shared/convention-sbm.js', attendu: /CONVENTION|SBM/, quoi: 'convention SBM' },
  { url: 'https://departs.kd-mc.com/boards-gen.js', attendu: /DEPARTS_GEN/, quoi: 'départs de la page légère' },
  { url: 'https://cmcteams-light.kd-mc.com/boards-gen.js', attendu: /DEPARTS_GEN/, quoi: 'départs (2e adresse)' },
  /* La page d'accueil du domaine lit la liste de ses apps dans un fichier à
     part, demandé en « /apps.json ». Il vit dans le dossier de l'app : c'est
     le routeur qui l'y trouve. Si ce rangement casse, l'accueil s'affiche
     vide de ses apps, sans erreur. */
  { url: 'https://kd-mc.com/apps.json', attendu: /"(apps|name|url)"/, quoi: 'liste des apps (accueil)' },
];

const res = [];
for (const c of CIBLES) {
  try {
    const r = await fetch(c.url, { headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(25000) });
    const t = await r.text();
    /* Le repli de l'hébergeur renvoie la page d'accueil : du HTML, code 200.
       C'est LE cas qu'on veut attraper — un 200 ne suffit donc jamais. */
    const estHtml = /<(!doctype|html)\b/i.test(t.slice(0, 400));
    const bon = r.status === 200 && !estHtml && c.attendu.test(t);
    res.push({ ...c, http: r.status, octets: t.length, estHtml, bon });
  } catch (e) {
    res.push({ ...c, http: 0, octets: 0, erreur: String(e.message).slice(0, 50), bon: false });
  }
}

console.log('ce que la page charge          HTTP    taille   verdict');
console.log('──────────────────────────────────────────────────────────────');
for (const r of res) {
  const v = r.bon ? '✅ vrai fichier de données'
    : r.estHtml ? '❌ page d\'accueil renvoyée à la place (repli hébergeur)'
      : r.http === 200 ? '❌ servi, mais le contenu attendu est absent'
        : `❌ HTTP ${r.http}${r.erreur ? ' — ' + r.erreur : ''}`;
  console.log(`${r.quoi.padEnd(28)} ${String(r.http).padStart(4)} ${String(r.octets).padStart(8)}   ${v}`);
}

const ko = res.filter((r) => !r.bon);
/* Refuser de conclure plutôt que crier au loup : depuis l'agent, le pare-feu
   répond 403 à TOUTES les adresses du domaine (mesuré le 19.09, corps de 105
   caractères). Une vraie panne du site serait PARTIELLE, ou renverrait un 200
   avec la page d'accueil. « Pas une seule réponse 200 » = c'est le réseau
   d'ici, pas kd-mc.com. */
if (res.every((r) => r.http !== 200)) {
  console.log('\n⚠️  aucune adresse n\'a répondu 200 : c\'est le réseau d\'ici, pas le site.');
  console.log('   Relancer depuis un runner CI (réseau ouvert) avant de conclure.');
  process.exit(2);
}
console.log(`\n=== ${res.length - ko.length} sur ${res.length} chargent vraiment leurs données ===`);
if (ko.length) {
  console.log('\nSans ces fichiers, le planning est VIDE alors que la page s\'affiche.');
  console.log('À regarder : le retrait du préfixe /CMCteams dans services/kdmc-router/worker.js.');
  process.exit(1);
}
console.log('L\'app et la page légère reçoivent bien leurs plannings. ✅');
