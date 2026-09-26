#!/usr/bin/env node
/**
 * Un chemin annoncé sur kd-mc.com doit EXISTER dans le paquet publié.
 *
 * Kevin 23.09.2026 : « empreinte m'envoie sur CMCteams ». Je lui avais donné
 * https://kd-mc.com/empreinte/ alors que le dossier vivait dans tools/, hors de
 * kdmc-home — le dossier que le routeur sert à la racine du domaine
 * ('kd-mc.com': '/CMCteams/kdmc-home'). Un chemin absent ne rend pas 404 : il
 * tombe dans le repli, qui affiche l'app CMCteams. Donc le lien AVAIT L'AIR de
 * marcher (HTTP 200) tout en montrant la mauvaise page — un ping seul ne
 * l'aurait pas vu. Même famille que la leçon #24.
 *
 * Ce que la garde vérifie : chaque adresse https://kd-mc.com/<x>/ citée dans les
 * documents que Kevin lit correspond à un dossier réel de kdmc-home/.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = ['KEVIN_ACTIONS_TODO.md', 'KEVIN_INVENTORY.md', 'ETAT-INFRA.md', 'MEMO_RESUME.md', 'CLAUDE.md'];

/* Servis autrement que par un dossier de kdmc-home : sous-domaines rendus par
   le routeur, points d'entrée d'API, pages posées à la racine de kdmc-home. */
const HORS_DOSSIER = new Set(['__sso', '__admin', '__arbre', '__lingua', '__bot', '__fin',
  '__mail', '__beatbot', '__deces', 'admin', 'tools', 'CMCteams', 'empreinte-test']);

let ok = 0, fail = 0;
const dit = (bon, msg) => { console.log(`  ${bon ? 'OK  ' : '❌  '}${msg}`); bon ? ok++ : fail++; };

console.log("\n=== UN CHEMIN ANNONCÉ SUR kd-mc.com EXISTE-T-IL VRAIMENT ? ===\n");

const vus = new Map();
for (const d of DOCS) {
  const p = join(RACINE, d);
  if (!existsSync(p)) continue;
  const txt = readFileSync(p, 'utf8');
  for (const m of txt.matchAll(/https:\/\/kd-mc\.com\/([a-z0-9][a-z0-9_-]*)\//gi)) {
    const seg = m[1];
    if (HORS_DOSSIER.has(seg)) continue;
    if (!vus.has(seg)) vus.set(seg, d);
  }
}

if (vus.size === 0) dit(true, 'aucun chemin annoncé (rien à vérifier)');
for (const [seg, doc] of vus) {
  const cible = join(RACINE, 'kdmc-home', seg);
  dit(existsSync(cible),
      `kd-mc.com/${seg}/ → kdmc-home/${seg}/ ${existsSync(cible) ? 'existe' : `INTROUVABLE (cité dans ${doc} → la page affichera CMCteams)`}`);
}

/* La règle elle-même : le domaine sert bien kdmc-home à la racine. Si ça change
   un jour, cette garde doit être revue — on le dit ici plutôt que de la laisser
   vérifier le mauvais dossier en silence. */
const routeur = readFileSync(join(RACINE, 'services/kdmc-router/worker.js'), 'utf8');
dit(/'kd-mc\.com':\s*'\/CMCteams\/kdmc-home'/.test(routeur),
    "le routeur sert bien kdmc-home à la racine de kd-mc.com (base de cette garde)");

console.log(`\n${fail === 0 ? '✅' : '❌'} CHEMINS DU DOMAINE : ${ok} contrôle(s) OK, ${fail} échec(s)\n`);
process.exit(fail === 0 ? 0 : 1);
