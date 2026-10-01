#!/usr/bin/env node
/* MESURE — qui consomme les 1 000 écritures KV par jour ?
 *
 * Mesuré le 1.10.2026 à 10h27 UTC (publication publique 36849092448) : « your account has reached the free
 * usage limit for this operation for today [code: 10048] » — le plafond gratuit d'écritures KV (1 000 par
 * jour, tout le compte, 5 workers sur le même espace) était consommé avant midi. Le 27.09 déjà.
 *
 * Ici on LIT l'API Analytics de Cloudflare (GraphQL, jeu de données kvOperationsAdaptiveGroups) : par jour,
 * par espace KV, par type d'opération (write / read / delete / list) et par heure. Lecture seule, aucun
 * appel au domaine (hors plafond des vérifs). Si le jeton n'a pas « Account Analytics : Read », on le dit.
 *
 * Usage : CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… node tools/audit/mesure-kv.mjs [jours=2]
 * Rapport : stdout + annotations GitHub (::notice / ::error) + résumé du job.
 * ========================================================================================================= */
import { appendFileSync } from 'node:fs';

const JOURS = Math.max(1, Math.min(7, parseInt(process.argv[2] || '2', 10) || 2));
const TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const COMPTE = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const PLAFOND_ECRITURES = 1000;      /* plan gratuit Workers KV : 1 000 écritures / jour / compte */

/* ── pur : mise en forme d'une réponse (testable sans réseau) ─────────────────────────────────────── */
export function resumer(json) {
  if (!json || !json.data || !json.data.viewer) {
    const err = (json && json.errors && json.errors[0] && json.errors[0].message) || 'réponse vide';
    const droit = /authoriz|permission|not authorized|access/i.test(err);
    return { ok: false, erreur: err, droit };
  }
  const comptes = json.data.viewer.accounts || [];
  const lignes = comptes.flatMap((a) => a.kvOperationsAdaptiveGroups || []);
  const parJourEspaceType = {};
  const parHeure = {};
  for (const l of lignes) {
    const d = l.dimensions || {}, n = (l.sum && l.sum.requests) || 0;
    const jour = String(d.datetimeHour || d.date || '').slice(0, 10);
    const k = `${jour}|${d.namespaceId || '?'}|${d.actionType || '?'}`;
    parJourEspaceType[k] = (parJourEspaceType[k] || 0) + n;
    if (d.actionType === 'write') { const h = String(d.datetimeHour || '').slice(0, 13); parHeure[h] = (parHeure[h] || 0) + n; }
  }
  const tableau = Object.entries(parJourEspaceType).map(([k, n]) => { const [jour, espace, type] = k.split('|'); return { jour, espace, type, n }; })
    .sort((a, b) => a.jour.localeCompare(b.jour) || a.espace.localeCompare(b.espace) || a.type.localeCompare(b.type));
  const ecrituresParJour = {};
  for (const t of tableau) if (t.type === 'write') ecrituresParJour[t.jour] = (ecrituresParJour[t.jour] || 0) + t.n;
  const heuresChargees = Object.entries(parHeure).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return { ok: true, tableau, ecrituresParJour, heuresChargees, lignes: lignes.length };
}

export function requete(compte, depuis, jusqua) {
  return {
    query: `query ($compte: String!, $depuis: Time!, $jusqua: Time!) {
      viewer { accounts(filter: { accountTag: $compte }) {
        kvOperationsAdaptiveGroups(limit: 2000, filter: { datetimeHour_geq: $depuis, datetimeHour_leq: $jusqua }) {
          sum { requests }
          dimensions { namespaceId actionType datetimeHour }
        } } } }`,
    variables: { compte, depuis, jusqua },
  };
}

export function texte(r, jours) {
  if (!r.ok) {
    return r.droit
      ? `❌ L'API Analytics refuse le jeton : « ${r.erreur} ». Il manque le droit « Compte → Analytics du compte → Lire » sur le jeton Cloudflare que GitHub utilise (même geste que pour le DNS le 30.09). Rien d'autre à faire.`
      : `❌ Lecture impossible : ${r.erreur}`;
  }
  const out = [];
  out.push(`Opérations KV sur ${jours} jour(s) — ${r.lignes} lignes lues (plafond gratuit : ${PLAFOND_ECRITURES} écritures/jour)\n`);
  out.push('jour        espace KV                           type     requêtes');
  out.push('──────────────────────────────────────────────────────────────────');
  for (const t of r.tableau) out.push(`${t.jour}  ${t.espace.padEnd(34)}  ${t.type.padEnd(7)}  ${String(t.n).padStart(8)}`);
  out.push('');
  for (const [jour, n] of Object.entries(r.ecrituresParJour)) out.push(`${n >= PLAFOND_ECRITURES ? '🔴' : n >= PLAFOND_ECRITURES * 0.7 ? '🟠' : '✅'} ${jour} : ${n} écritures${n >= PLAFOND_ECRITURES ? ' — PLAFOND ATTEINT' : ''}`);
  if (r.heuresChargees.length) { out.push('\nheures les plus chargées (écritures) :'); for (const [h, n] of r.heuresChargees) out.push(`  ${h}h UTC : ${n}`); }
  return out.join('\n');
}

/* ── main ──────────────────────────────────────────────────────────────────────────────────────────── */
if (process.argv[1] && /mesure-kv\.mjs$/.test(process.argv[1]) && !process.env.MESURE_KV_SELFTEST) {
  if (!TOKEN || !COMPTE) { console.error('CLOUDFLARE_API_TOKEN et CLOUDFLARE_ACCOUNT_ID requis'); process.exit(2); }
  const fin = new Date(); fin.setUTCMinutes(0, 0, 0);
  const debut = new Date(fin.getTime() - (JOURS - 1) * 86400000); debut.setUTCHours(0, 0, 0, 0);
  const rep = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST', headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify(requete(COMPTE, debut.toISOString().replace(/\.\d{3}Z$/, 'Z'), fin.toISOString().replace(/\.\d{3}Z$/, 'Z'))),
    signal: AbortSignal.timeout(30000),
  });
  let json = null; try { json = await rep.json(); } catch { json = null; }
  const r = resumer(json);
  const t = texte(r, JOURS);
  console.log(t);
  const annot = (niveau, msg) => console.log(`::${niveau} title=Mesure KV::${msg.replace(/\n/g, '%0A').slice(0, 3800)}`);
  if (!r.ok) { annot('error', t); process.exit(1); }
  annot('notice', t);
  try { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## Mesure KV\n\n```\n' + t + '\n```\n'); } catch { /* */ }
}
