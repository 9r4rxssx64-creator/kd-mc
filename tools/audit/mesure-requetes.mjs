#!/usr/bin/env node
/* MESURE — combien de requêtes par jour sur les Workers du compte ? (le plafond qui a couché le domaine)
 *
 * Mesuré le 27.09.2026 vers 22h00 UTC : 48 surfaces sur 48 en HTTP 429 « the owner has reached their plan limits »
 * — le plan gratuit Workers compte 100 000 requêtes PAR JOUR pour TOUT le compte, et avec `run_worker_first = true`
 * chaque page, script, image servi par le domaine en consomme une. Ce jour-là, ce sont nos robots de vérification
 * qui avaient vidé le budget : le domaine était hors service pour tout le monde jusqu'à minuit UTC.
 *
 * Kevin 8.10 : « tout gratuit, mais que tout fonctionne comme avant, performance optimale pour tout le monde » :
 * ça commence par SAVOIR, chaque jour, où en est le budget — et qui le mange (robots ou vraies personnes).
 *
 * Ici on LIT l'API Analytics de Cloudflare (GraphQL, jeu de données workersInvocationsAdaptive) : par jour, par
 * worker, par heure, avec les sous-requêtes et les erreurs. Lecture seule, aucun appel au domaine.
 *
 * Usage : CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… node tools/audit/mesure-requetes.mjs [jours=2]
 * Rapport : stdout + annotations GitHub (::notice / ::error) + résumé du job.
 * Tests : tests/verify-mesure-requetes.mjs (resumer / requete / texte sont purs).
 * ========================================================================================================= */
import { appendFileSync } from 'node:fs';

const JOURS = Math.max(1, Math.min(7, parseInt(process.argv[2] || '2', 10) || 2));
const TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const COMPTE = process.env.CLOUDFLARE_ACCOUNT_ID || '';
export const PLAFOND_REQUETES = 100000;   /* plan gratuit Workers : 100 000 requêtes / jour / compte */

/* ── pur : mise en forme d'une réponse (testable sans réseau) ─────────────────────────────────────── */
export function resumer(json) {
  if (!json || !json.data || !json.data.viewer) {
    const err = (json && json.errors && json.errors[0] && json.errors[0].message) || 'réponse vide';
    const droit = /authoriz|permission|not authorized|access/i.test(err);
    return { ok: false, erreur: err, droit };
  }
  const comptes = json.data.viewer.accounts || [];
  const lignes = comptes.flatMap((a) => a.workersInvocationsAdaptive || []);
  const parJour = {}, parJourWorker = {}, parHeure = {}, erreursParJour = {}, sousReqParJour = {};
  for (const l of lignes) {
    const d = l.dimensions || {}, s = l.sum || {};
    const n = s.requests || 0;
    const jour = String(d.datetimeHour || d.date || '').slice(0, 10);
    if (!jour) continue;
    parJour[jour] = (parJour[jour] || 0) + n;
    erreursParJour[jour] = (erreursParJour[jour] || 0) + (s.errors || 0);
    sousReqParJour[jour] = (sousReqParJour[jour] || 0) + (s.subrequests || 0);
    const k = `${jour}|${d.scriptName || '?'}`;
    parJourWorker[k] = (parJourWorker[k] || 0) + n;
    const h = String(d.datetimeHour || '').slice(0, 13);
    if (h) parHeure[h] = (parHeure[h] || 0) + n;
  }
  const tableau = Object.entries(parJourWorker).map(([k, n]) => { const [jour, worker] = k.split('|'); return { jour, worker, n }; })
    .sort((a, b) => a.jour.localeCompare(b.jour) || b.n - a.n);
  const heuresChargees = Object.entries(parHeure).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return { ok: true, tableau, parJour, erreursParJour, sousReqParJour, heuresChargees, lignes: lignes.length };
}

export function requete(compte, depuis, jusqua) {
  return {
    query: `query ($compte: String!, $depuis: Time!, $jusqua: Time!) {
      viewer { accounts(filter: { accountTag: $compte }) {
        workersInvocationsAdaptive(limit: 5000, filter: { datetime_geq: $depuis, datetime_leq: $jusqua }) {
          sum { requests subrequests errors }
          dimensions { scriptName datetimeHour }
        } } } }`,
    variables: { compte, depuis, jusqua },
  };
}

export function texte(r, jours) {
  if (!r.ok) {
    return r.droit
      ? `❌ L'API Analytics refuse le jeton : « ${r.erreur} ». Il manque le droit « Compte → Analytics du compte → Lire » sur le jeton Cloudflare que GitHub utilise. Rien de mesuré.`
      : `❌ Lecture impossible : ${r.erreur}`;
  }
  const out = [];
  out.push(`Requêtes Workers sur ${jours} jour(s) — ${r.lignes} lignes lues (plafond gratuit : ${PLAFOND_REQUETES} requêtes/jour, tout le compte)\n`);
  out.push('jour        worker                          requêtes');
  out.push('───────────────────────────────────────────────────────');
  for (const t of r.tableau) out.push(`${t.jour}  ${t.worker.padEnd(30)}  ${String(t.n).padStart(8)}`);
  out.push('');
  for (const [jour, n] of Object.entries(r.parJour).sort()) {
    const pct = Math.round((n / PLAFOND_REQUETES) * 100);
    const ico = n >= PLAFOND_REQUETES ? '🔴' : n >= PLAFOND_REQUETES * 0.7 ? '🟠' : '✅';
    out.push(`${ico} ${jour} : ${n} requêtes (${pct} % du plafond) · ${r.sousReqParJour[jour] || 0} sous-requêtes · ${r.erreursParJour[jour] || 0} erreurs${n >= PLAFOND_REQUETES ? ' — PLAFOND ATTEINT : 429 pour tout le monde jusqu\'à minuit UTC' : ''}`);
  }
  if (r.heuresChargees.length) { out.push('\nheures les plus chargées (requêtes) :'); for (const [h, n] of r.heuresChargees) out.push(`  ${h}h UTC : ${n}`); }
  return out.join('\n');
}

/* ── main ──────────────────────────────────────────────────────────────────────────────────────────── */
if (process.argv[1] && /mesure-requetes\.mjs$/.test(process.argv[1]) && !process.env.MESURE_REQUETES_SELFTEST) {
  if (!TOKEN || !COMPTE) { console.error('CLOUDFLARE_API_TOKEN et CLOUDFLARE_ACCOUNT_ID requis'); process.exit(2); }
  const fin = new Date(); fin.setUTCMinutes(0, 0, 0);
  const debut = new Date(fin.getTime() - (JOURS - 1) * 86400000); debut.setUTCHours(0, 0, 0, 0);
  const iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const rep = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST', headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify(requete(COMPTE, iso(debut), iso(fin))),
    signal: AbortSignal.timeout(30000),
  });
  let json = null; try { json = await rep.json(); } catch { json = null; }
  const r = resumer(json);
  const t = texte(r, JOURS);
  console.log(t);
  const annot = (niveau, msg) => console.log(`::${niveau} title=Mesure requêtes::${msg.replace(/\n/g, '%0A').slice(0, 3800)}`);
  if (!r.ok) { annot('error', t); process.exit(1); }
  annot('notice', t);
  try { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## Mesure requêtes Workers\n\n```\n' + t + '\n```\n'); } catch { /* */ }
}
