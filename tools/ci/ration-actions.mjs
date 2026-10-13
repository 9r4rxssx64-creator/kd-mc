#!/usr/bin/env node
/* RATION DES MINUTES GITHUB ACTIONS DU COFFRE — « Prévient toutes tes branches de privilégier le gratuit. Même pour les actions » (Kevin 13.10.2026).
 * =========================================================================================================================
 * Le budget Actions du coffre est une ration (13.10 : 10 $ restants jusqu'au 31.10 ≈ 60 min/jour). AVANT de lancer, de relancer ou de
 * déclencher un robot du coffre, une session lit ce qui est DÉJÀ consommé aujourd'hui (jour UTC) et ce que chaque robot a coûté :
 *
 *   gh api "repos/9r4rxssx64-creator/CMCteams/actions/runs?created=>=$(date -u +%F)&per_page=100" > /tmp/runs.json
 *   node tools/ci/ration-actions.mjs --runs /tmp/runs.json            (lecture seule : rien n'est écrit, rien n'est lancé)
 *
 * Sortie : minutes consommées aujourd'hui (bord à bord = un peu au-dessus de la facture réelle, donc prudent), la ration restante, les
 * robots qui ont le plus coûté, et un verdict : « 🟢 il reste de la ration », « 🟠 plus de la moitié mangée : regroupe », « 🔴 ration
 * mangée : n'en lance AUCUN, teste en local ». Un run mort en < 15 s sans étape (budget refusé) ne coûte rien et n'est pas compté.
 * Code de sortie : 0 si vert/orange, 3 si rouge — une session qui enchaîne des commandes s'arrête ainsi toute seule.
 * La fonction `ration` est pure : elle est testée (tests/verify-ration-actions.mjs), y compris sa preuve par sabotage. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const RATION_MIN_PAR_JOUR = 60;
export const MORT_NE_COUTE_RIEN_S = 15;

const dur = (r) => { const a = Date.parse(r.run_started_at || r.created_at), b = Date.parse(r.updated_at); return Number.isFinite(a) && Number.isFinite(b) && b > a ? (b - a) / 1000 : 0; };

/* runs : le tableau `workflow_runs` de l'API ; jour : 'AAAA-MM-JJ' (UTC) ; → { minutes, reste, top, comptes, ignores, verdict } */
export function ration(runs, jour, max = RATION_MIN_PAR_JOUR) {
  const liste = (Array.isArray(runs) ? runs : (runs && runs.workflow_runs) || []).filter((r) => r && String(r.run_started_at || r.created_at || '').startsWith(jour));
  let secondes = 0, ignores = 0; const parNom = {};
  for (const r of liste) {
    const s = dur(r);
    if (r.status === 'completed' && s < MORT_NE_COUTE_RIEN_S) { ignores++; continue; }   /* refusé par le budget ou sauté : 0 minute */
    secondes += s; parNom[r.name || '?'] = (parNom[r.name || '?'] || 0) + s;
  }
  const minutes = Math.ceil(secondes / 60);
  const top = Object.entries(parNom).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([nom, s]) => ({ nom, minutes: Math.ceil(s / 60) }));
  const reste = Math.max(0, max - minutes);
  const verdict = minutes >= max ? 'rouge' : minutes >= max / 2 ? 'orange' : 'vert';
  return { jour, minutes, max, reste, top, comptes: liste.length - ignores, ignores, verdict };
}

export function texte(r) {
  const tete = { vert: '🟢 il reste de la ration', orange: '🟠 plus de la moitié de la ration est mangée : regroupe tes changements, un seul robot', rouge: '🔴 ration du jour MANGÉE : ne lance AUCUN robot du coffre, teste en local et fusionne' }[r.verdict];
  return [`Ration Actions du coffre — ${r.jour} (UTC)`, `${r.minutes} min consommées sur ${r.max} (${r.reste} restantes) · ${r.comptes} run(s) comptés, ${r.ignores} refusé(s)/sauté(s) à 0 min`, tete,
    ...(r.top.length ? ['Les plus gourmands : ' + r.top.map((t) => `${t.nom} ${t.minutes} min`).join(' · ')] : [])].join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const i = process.argv.indexOf('--runs');
  if (i < 0 || !process.argv[i + 1]) { console.error('Usage : node tools/ci/ration-actions.mjs --runs <fichier.json>  (voir l\'en-tête pour la commande gh api)'); process.exit(2); }
  const jourArg = process.argv.indexOf('--jour');
  const jour = jourArg > 0 ? process.argv[jourArg + 1] : new Date().toISOString().slice(0, 10);
  const r = ration(JSON.parse(readFileSync(process.argv[i + 1], 'utf8')), jour);
  console.log(texte(r));
  process.exit(r.verdict === 'rouge' ? 3 : 0);
}
