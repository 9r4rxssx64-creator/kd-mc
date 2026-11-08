/* TÂCHE 102 — « base vérifiée / éditions manuelles » : PREMIÈRE ÉTAPE LIVRABLE (cmcteams-pdf, 8.11.2026).
 * Firebase ne stocke que les ÉDITIONS d'un mois (cmc_ov/<mois>) ; la base vérifiée est le PDF (seed). Avant de toucher à la règle de fond
 * (laquelle gagne, quand), on MESURE : pour chaque case de Firebase, est-elle
 *   · « identique » : même code que le PDF → redondante (rien à garder, rien de perdu à la retirer) ;
 *   · « edition »   : code différent du PDF → ÉDITION MANUELLE, à ne JAMAIS perdre ;
 *   · « sans_base » : le PDF n'a pas cette case (personne / jour absent) → édition ou ajout, à ne JAMAIS perdre.
 * Lecture seule : cette étape ne modifie aucune donnée. Les cases du PDF absentes de Firebase sont comptées « base_seule » (rien à signaler).
 * Usage : node tools/planning/classer-editions.mjs <seed-mois.json> <firebase-mois.json>   (formats { id: { jour: code } }, ou { ov: {…} }) */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const nu = (x) => (x && typeof x === 'object' && x.ov && typeof x.ov === 'object') ? x.ov : (x || {});
const code = (v) => (v && typeof v === 'object' && 'code' in v) ? v.code : v;

export function classerEditions(seedMois, liveMois) {
  const S = nu(seedMois), L = nu(liveMois);
  const r = { identique: 0, edition: 0, sans_base: 0, base_seule: 0, editions: [], sansBase: [] };
  for (const id of Object.keys(L)) {
    for (const j of Object.keys(L[id] || {})) {
      const live = code(L[id][j]);
      const base = S[id] && Object.prototype.hasOwnProperty.call(S[id], j) ? code(S[id][j]) : undefined;
      if (base === undefined) { r.sans_base++; r.sansBase.push({ id, jour: j, live }); }
      else if (String(base) === String(live)) r.identique++;
      else { r.edition++; r.editions.push({ id, jour: j, pdf: base, live }); }
    }
  }
  for (const id of Object.keys(S)) for (const j of Object.keys(S[id] || {})) if (!(L[id] && Object.prototype.hasOwnProperty.call(L[id], j))) r.base_seule++;
  /* la règle de fond : une édition ou un ajout est TOUJOURS à garder ; seule une case identique est sans danger à retirer */
  r.a_garder = r.edition + r.sans_base;
  return r;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [a, b] = process.argv.slice(2);
  if (!a || !b) { console.log('usage : node tools/planning/classer-editions.mjs <seed-mois.json> <firebase-mois.json>'); process.exit(2); }
  const r = classerEditions(JSON.parse(readFileSync(a, 'utf8')), JSON.parse(readFileSync(b, 'utf8')));
  console.log(JSON.stringify({ identique: r.identique, edition: r.edition, sans_base: r.sans_base, base_seule: r.base_seule, a_garder: r.a_garder }));
}
