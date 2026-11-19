#!/usr/bin/env node
/* MESURE DES QUOTAS GRATUITS CLOUDFLARE — D1 (lignes lues / écrites) et Workers AI (neurones), par base et par jour (Kevin 29.10.2026 :
 * « trouve une solution gratuite pour les Workers Paid à 5 €/mois… reste toujours dans les quotas de tous nos abonnements sans rien dépasser »).
 * Le 25.10, le quota de LECTURE de D1 (5 M lignes/jour, tout le compte) a coupé le pont, Apex Chat et kdmc-vente jusqu'à minuit UTC. Avant de
 * corriger un consommateur, on le MESURE : ici l'API Analytics de Cloudflare (GraphQL, lecture seule) dit quelle base lit combien, et le verdict
 * est comparé à `tools/quotas/plafonds.json` (orange dès 50 %, rouge dès 80 % : on agit AVANT la coupure, jamais après).
 * Usage : CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… node tools/audit/mesure-quotas.mjs [jours=2]
 * Rapport : stdout + annotations GitHub + résumé du job. Le jeu de données Workers AI peut manquer au jeton : le dire, jamais deviner. */
import { appendFileSync, readFileSync } from 'node:fs';

const PLAFONDS = JSON.parse(readFileSync(new URL('../quotas/plafonds.json', import.meta.url), 'utf8'));
export const P = PLAFONDS.cloudflare;
export const ORANGE = PLAFONDS.seuil_orange, ROUGE = PLAFONDS.seuil_rouge;

export function requeteD1(compte, depuis, jusqua) {
  return { query: `query ($compte: String!, $depuis: Date!, $jusqua: Date!) { viewer { accounts(filter: { accountTag: $compte }) {
    d1AnalyticsAdaptiveGroups(limit: 2000, filter: { date_geq: $depuis, date_leq: $jusqua }) {
      sum { readQueries writeQueries rowsRead rowsWritten } dimensions { databaseId date } } } } }`, variables: { compte, depuis, jusqua } };
}
export function requeteIA(compte, depuis, jusqua) {
  return { query: `query ($compte: String!, $depuis: Time!, $jusqua: Time!) { viewer { accounts(filter: { accountTag: $compte }) {
    aiInferenceAdaptiveGroups(limit: 2000, filter: { datetime_geq: $depuis, datetime_leq: $jusqua }) {
      sum { totalNeurons } dimensions { modelId date } } } } }`, variables: { compte, depuis, jusqua } };
}
/* 19.11 (Kevin : « j'ai reçu une facture Cloudflare, regarde qui consomme et pourquoi ») : la mesure par base ne dit pas QUELLE requête lit les lignes.
   Trois lectures de plus, toutes en lecture seule : les requêtes SQL les plus gourmandes (texte à « ? », aucune valeur), les appels par Worker, les abonnements du compte. */
export function requeteD1Requetes(compte, depuis, jusqua) {
  return { query: `query ($compte: String!, $depuis: Date!, $jusqua: Date!) { viewer { accounts(filter: { accountTag: $compte }) {
    d1QueriesAdaptiveGroups(limit: 400, filter: { date_geq: $depuis, date_leq: $jusqua }, orderBy: [sum_rowsRead_DESC]) {
      count sum { rowsRead rowsWritten } dimensions { query databaseId } } } } }`, variables: { compte, depuis, jusqua } };
}
export function requeteWorkers(compte, depuis, jusqua) {
  return { query: `query ($compte: String!, $depuis: Time!, $jusqua: Time!) { viewer { accounts(filter: { accountTag: $compte }) {
    workersInvocationsAdaptive(limit: 2000, filter: { datetime_geq: $depuis, datetime_leq: $jusqua }) {
      sum { requests subrequests errors } dimensions { scriptName date } } } } }`, variables: { compte, depuis, jusqua } };
}
/** Les requêtes SQL qui lisent le plus de lignes : { ok, top:[{ base, requete, fois, lues, parFois }] }. */
export function resumerRequetes(json, noms = {}, n = 15) {
  if (!json || !json.data || !json.data.viewer) return { ok: false, erreur: erreurDe(json) };
  const m = new Map();
  for (const l of (json.data.viewer.accounts || []).flatMap((a) => a.d1QueriesAdaptiveGroups || [])) {
    const d = l.dimensions || {}, base = noms[d.databaseId] || String(d.databaseId || '?').slice(0, 8), q = String(d.query || '').replace(/\s+/g, ' ').trim();
    const e = m.get(base + '|' + q) || { base, requete: q, fois: 0, lues: 0 }; e.fois += l.count || 0; e.lues += (l.sum || {}).rowsRead || 0; m.set(base + '|' + q, e);
  }
  const top = [...m.values()].sort((a, b) => b.lues - a.lues).slice(0, n).map((e) => Object.assign(e, { parFois: e.fois ? Math.round(e.lues / e.fois) : 0 }));
  return { ok: true, top, total: [...m.values()].reduce((s, e) => s + e.lues, 0) };
}
/** Appels par Worker et par jour : { ok, jours:{ jour:{ total, parScript:{} } } }. */
export function resumerWorkers(json) {
  if (!json || !json.data || !json.data.viewer) return { ok: false, erreur: erreurDe(json) };
  const jours = {};
  for (const l of (json.data.viewer.accounts || []).flatMap((a) => a.workersInvocationsAdaptive || [])) {
    const d = l.dimensions || {}, j = String(d.date || '').slice(0, 10); if (!j) continue;
    const e = (jours[j] ||= { total: 0, parScript: {} }), r = (l.sum || {}).requests || 0; e.total += r; e.parScript[d.scriptName || '?'] = (e.parScript[d.scriptName || '?'] || 0) + r;
  }
  return { ok: true, jours };
}
export function texteDetail(rq, wk, abo) {
  const out = [];
  if (!rq.ok) out.push(`\n⚠️ Requêtes SQL : non mesurées (« ${rq.erreur} »).`);
  else { out.push('\nLes requêtes SQL qui lisent le plus (toute la période) :'); out.push('lignes lues   fois  lignes/fois  base           requête');
    for (const e of rq.top) out.push(`${String(e.lues).padStart(11)} ${String(e.fois).padStart(6)} ${String(e.parFois).padStart(11)}  ${e.base.padEnd(14)} ${e.requete.slice(0, 150)}`); }
  if (!wk.ok) out.push(`\n⚠️ Appels des Workers : non mesurés (« ${wk.erreur} »).`);
  else { out.push('\nAppels des Workers par jour (plafond gratuit ' + P.workers_requetes_par_jour + ') :');
    for (const [j, e] of Object.entries(wk.jours).sort()) out.push(`  ${etat(e.total, P.workers_requetes_par_jour)} ${j} : ${e.total} — ` + Object.entries(e.parScript).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => k + ' ' + v).join(' · ')); }
  out.push('\nAbonnements du compte : ' + (abo.ok ? (abo.liste.length ? abo.liste.join(' · ') : 'aucun abonnement payant listé') : 'non lisibles avec ce jeton (« ' + abo.erreur + ' ») — la facture se lit dans le tableau de bord Cloudflare'));
  return out.join('\n');
}
const erreurDe = (j) => (j && j.errors && j.errors[0] && j.errors[0].message) || 'réponse vide';
const droit = (m) => /authoriz|permission|not authorized|access|unknown field|cannot query/i.test(m);

/** noms : { databaseId → nom } ; rend les lignes par jour/base et le total par jour. */
export function resumerD1(json, noms = {}) {
  if (!json || !json.data || !json.data.viewer) return { ok: false, erreur: erreurDe(json), droit: droit(erreurDe(json)) };
  const lignes = (json.data.viewer.accounts || []).flatMap((a) => a.d1AnalyticsAdaptiveGroups || []);
  const parBase = {}, jours = {};
  for (const l of lignes) {
    const d = l.dimensions || {}, s = l.sum || {}; if (!d.date) continue;
    const nom = noms[d.databaseId] || String(d.databaseId || '?').slice(0, 8);
    const b = (parBase[d.date + '|' + nom] ||= { jour: d.date, base: nom, lues: 0, ecrites: 0, reqLues: 0, reqEcrites: 0 });
    b.lues += s.rowsRead || 0; b.ecrites += s.rowsWritten || 0; b.reqLues += s.readQueries || 0; b.reqEcrites += s.writeQueries || 0;
    const j = (jours[d.date] ||= { lues: 0, ecrites: 0 }); j.lues += s.rowsRead || 0; j.ecrites += s.rowsWritten || 0;
  }
  return { ok: true, bases: Object.values(parBase).sort((a, b) => a.jour.localeCompare(b.jour) || b.lues - a.lues), jours };
}
export function resumerIA(json) {
  if (!json || !json.data || !json.data.viewer) return { ok: false, erreur: erreurDe(json), droit: droit(erreurDe(json)) };
  const lignes = (json.data.viewer.accounts || []).flatMap((a) => a.aiInferenceAdaptiveGroups || []);
  const jours = {}; for (const l of lignes) { const d = String((l.dimensions || {}).date || '').slice(0, 10); if (d) jours[d] = (jours[d] || 0) + ((l.sum || {}).totalNeurons || 0); }
  return { ok: true, jours };
}
export function etat(n, plafond, rouge = ROUGE) { const p = n / plafond; return p >= 1 ? '🔴 DÉPASSÉ' : p >= rouge ? '🔴' : p >= ORANGE ? '🟠' : '✅'; }
export function texte(d1, ia) {
  const out = [];
  if (!d1.ok) out.push(d1.droit ? `❌ D1 : l'API Analytics refuse (« ${d1.erreur} ») — il manque « Compte → Analytics du compte → Lire » au jeton.` : `❌ D1 : lecture impossible (${d1.erreur})`);
  else {
    out.push(`D1 — plafonds gratuits PAR JOUR, tout le compte : ${P.d1_lignes_lues_par_jour.toLocaleString('fr-FR')} lignes lues · ${P.d1_lignes_ecrites_par_jour.toLocaleString('fr-FR')} écrites\n`);
    out.push('jour        base                lues        écrites   requêtes lecture');
    for (const b of d1.bases) out.push(`${b.jour}  ${b.base.padEnd(18)} ${String(b.lues).padStart(10)}  ${String(b.ecrites).padStart(9)}   ${String(b.reqLues).padStart(8)}${b.reqLues ? '  (≈ ' + Math.round(b.lues / b.reqLues) + ' lignes lues par requête)' : ''}`);
    out.push('');
    for (const [j, t] of Object.entries(d1.jours).sort()) out.push(`${etat(t.lues, P.d1_lignes_lues_par_jour)} ${j} : ${t.lues} lignes lues (${Math.round(t.lues / P.d1_lignes_lues_par_jour * 100)} % de 5 M) · ${etat(t.ecrites, P.d1_lignes_ecrites_par_jour)} ${t.ecrites} écrites (${Math.round(t.ecrites / P.d1_lignes_ecrites_par_jour * 100)} % de 100 k)`);
  }
  if (!ia.ok) out.push(`\n⚠️ Workers AI : ${ia.droit ? 'jeu de données refusé ou inconnu pour ce jeton' : 'lecture impossible'} (« ${ia.erreur} ») — neurones non mesurés.`);
  else { out.push('\nWorkers AI — plafond gratuit ' + P.workers_ai_neurones_par_jour + ' neurones/jour :'); for (const [j, n] of Object.entries(ia.jours).sort()) out.push(`  ${etat(n, P.workers_ai_neurones_par_jour)} ${j} : ${Math.round(n)} neurones (${Math.round(n / P.workers_ai_neurones_par_jour * 100)} %)`); }
  return out.join('\n');
}

if (process.argv[1] && /(^|[\\/])mesure-quotas\.mjs$/.test(process.argv[1]) && !process.env.MESURE_QUOTAS_SELFTEST) {
  const TOKEN = process.env.CLOUDFLARE_API_TOKEN || '', COMPTE = process.env.CLOUDFLARE_ACCOUNT_ID || P.compte;
  const JOURS = Math.max(1, Math.min(7, parseInt(process.argv[2] || '2', 10) || 2));
  if (!TOKEN) { console.error('CLOUDFLARE_API_TOKEN requis'); process.exit(2); }
  const fin = new Date(); const debut = new Date(fin.getTime() - (JOURS - 1) * 86400000);
  const jour = (d) => d.toISOString().slice(0, 10), iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const gql = async (corps) => { const r = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' }, body: JSON.stringify(corps), signal: AbortSignal.timeout(30000) }); return r.json().catch(() => null); };
  const noms = {};
  try { const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${COMPTE}/d1/database?per_page=100`, { headers: { authorization: 'Bearer ' + TOKEN }, signal: AbortSignal.timeout(30000) }); const j = await r.json(); for (const b of (j.result || [])) noms[b.uuid] = b.name; } catch { /* les identifiants courts suffisent */ }
  const d1 = resumerD1(await gql(requeteD1(COMPTE, jour(debut), jour(fin))), noms);
  const ia = resumerIA(await gql(requeteIA(COMPTE, iso(new Date(debut.setUTCHours(0, 0, 0, 0))), iso(fin))));
  const rq = resumerRequetes(await gql(requeteD1Requetes(COMPTE, jour(debut), jour(fin))).catch((e) => ({ errors: [{ message: String(e.message || e) }] })), noms);
  const wk = resumerWorkers(await gql(requeteWorkers(COMPTE, iso(debut), iso(fin))).catch((e) => ({ errors: [{ message: String(e.message || e) }] })));
  let abo = { ok: false, erreur: 'non lu' };
  try { const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${COMPTE}/subscriptions`, { headers: { authorization: 'Bearer ' + TOKEN }, signal: AbortSignal.timeout(30000) }); const j = await r.json();
    abo = j && j.success ? { ok: true, liste: (j.result || []).map((x) => ((x.rate_plan && (x.rate_plan.public_name || x.rate_plan.id)) || '?') + ' ' + (x.price != null ? x.price + ' ' + (x.currency || '') : '') + (x.frequency ? ' / ' + x.frequency : '') + (x.state ? ' (' + x.state + ')' : '')) } : { ok: false, erreur: (j && j.errors && j.errors[0] && j.errors[0].message) || 'HTTP ' + r.status };
  } catch (e) { abo = { ok: false, erreur: String(e.message || e).slice(0, 80) }; }
  const t = texte(d1, ia); console.log(t);
  const t2 = texteDetail(rq, wk, abo); console.log(t2);
  console.log(`::notice title=Mesure quotas (détail)::${t2.replace(/\n/g, '%0A').slice(0, 3800)}`);
  const annot = (n, m) => console.log(`::${n} title=Mesure quotas::${m.replace(/\n/g, '%0A').slice(0, 3800)}`);
  annot(!d1.ok ? 'error' : /🔴/.test(t) ? 'error' : /🟠/.test(t) ? 'warning' : 'notice', t);
  try { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## Mesure quotas D1 / Workers AI\n\n```\n' + t + '\n```\n'); } catch { /* */ }
  process.exit(d1.ok ? 0 : 1);
}
